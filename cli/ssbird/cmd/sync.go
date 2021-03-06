package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
)

type GetCommitResponse struct {
	Sha string `json:"sha"`
}

type SyncRequest struct {
	CsvText         string `json:"csvText"`
	SheetName       string `json:"sheetName"`
	RootFolderId    string `json:"rootFolderId"`
	SpreadsheetPath string `json:"spreadsheetPath"`
	SyncPassword    string `json:"syncPassword"`
}

var sheetName, csvPath string

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync csv data in Spreadsheet",
	Long: `Sync csv data in Spreadsheet.
For example,

ssbird sync --csv-path csvs/example.csv --sheet-name develop

In this example, create "csvs" folder and "example" spreadsheet in Google Drive if they don't exist,
then create "develop" sheet if it doesn't exist and write the csv data to it.

Note that --csv-path for the argument must be relative to the repository.`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := readConfig(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := sync(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(syncCmd)

	syncCmd.Flags().StringVarP(&csvPath, "csv-path", "c", "", "csv path, which is a path relative to the repository")
	syncCmd.Flags().StringVarP(&sheetName, "sheet-name", "s", "", "sync sheet name")

	syncCmd.MarkFlagRequired("csv-path")
	syncCmd.MarkFlagRequired("sheet-name")
}

func readConfig() error {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	viper.SetConfigFile(filepath.Join(configDir, "SSBird", "cli-config.json"))
	err = viper.ReadInConfig()
	if err != nil {
		return err
	}

	return nil
}

func sync() error {
	const csvPrefix = "./"
	if strings.HasPrefix(csvPath, csvPrefix) {
		csvPath = csvPath[len(csvPrefix):]
	}

	repositoryUrl := viper.GetString("repositoryUrl")
	const gitHubSubstr = "github.com/"
	repositoryName := repositoryUrl[strings.Index(repositoryUrl, gitHubSubstr)+len(gitHubSubstr):]

	commitUrl := fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", repositoryName, sheetName)
	commitResponseJson, err := request("GET", commitUrl, viper.GetString("gitHubAccessToken"), nil)
	if err != nil {
		return err
	}
	var commitResponse GetCommitResponse
	err = json.Unmarshal([]byte(commitResponseJson), &commitResponse)
	if err != nil {
		return err
	}

	csvUrl := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s", repositoryName, commitResponse.Sha, csvPath)
	csvText, err := request("GET", csvUrl, viper.GetString("gitHubAccessToken"), nil)
	if err != nil {
		return err
	}

	syncRequest := new(SyncRequest)
	syncRequest.CsvText = csvText
	syncRequest.SheetName = sheetName
	syncRequest.RootFolderId = viper.GetString("rootFolderId")
	spreadsheetPath := csvPath
	const csvSuffix = ".csv"
	if strings.HasSuffix(spreadsheetPath, csvSuffix) {
		spreadsheetPath = spreadsheetPath[:len(spreadsheetPath)-len(csvSuffix)]
	}
	syncRequest.SpreadsheetPath = spreadsheetPath
	syncRequest.SyncPassword = viper.GetString("syncPassword")
	syncRequestJson, _ := json.Marshal(syncRequest)
	googleAccessToken, err := getGoogleAccessToken()
	if err != nil {
		return err
	}
	syncResponse, err := request("POST", viper.GetString("syncUrl"), googleAccessToken, syncRequestJson)
	if err != nil {
		return err
	}
	if syncResponse != "{}" {
		return fmt.Errorf("Error Response")
	}

	return nil
}

func request(method string, url string, token string, json []byte) (string, error) {
	fmt.Printf("Requesting %s\n", url)

	var jsonBuf io.Reader
	if json != nil {
		jsonBuf = bytes.NewBuffer(json)
	}
	req, err := http.NewRequest(method, url, jsonBuf)
	if err != nil {
		return "", err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Cache-Control", "no-cache")

	client := &http.Client{Timeout: time.Duration(360) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("Status Code: %d", resp.StatusCode)
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	bodyStr := string(body)

	const maxLength = 3000
	cutStr := bodyStr
	if len(cutStr) > maxLength {
		cutStr = cutStr[:maxLength] + "..."
	}
	fmt.Println(cutStr)

	return bodyStr, nil
}

func getGoogleAccessToken() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	msDir := filepath.Join(configDir, "SSBird")
	saPath := filepath.Join(msDir, "service-account.json")

	var token *oauth2.Token

	if _, err := os.Stat(saPath); err == nil {
		// Service Account

		jsonBytes, err := ioutil.ReadFile(filepath.Join(msDir, "service-account.json"))
		if err != nil {
			return "", err
		}

		config, err := google.JWTConfigFromJSON(jsonBytes, drive.DriveScope)
		if err != nil {
			return "", err
		}
		token, err = config.TokenSource(oauth2.NoContext).Token()
		if err != nil {
			return "", err
		}
	} else {
		// OAuth 2.0

		oldToken := new(oauth2.Token)
		oldToken.RefreshToken = viper.GetString("googleRefreshToken")
		oldToken.TokenType = "Bearer"

		var config = &oauth2.Config{
			ClientID:     viper.GetString("googleClientId"),
			ClientSecret: viper.GetString("googleClientSecret"),
			Endpoint:     google.Endpoint,
			Scopes:       []string{drive.DriveScope},
		}

		token, err = config.TokenSource(oauth2.NoContext, oldToken).Token()
		if err != nil {
			return "", err
		}
	}

	return token.AccessToken, nil
}
