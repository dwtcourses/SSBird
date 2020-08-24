package cmd

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var config, serviceAccount string

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize msbird command",
	Long: `Initialize msbird command.
For example,

msbird init --config config.json --service-account service-account.json

In this example, you use config and service account to initialize msbird.
The json keys required in config are as follows

{
  "syncUrl": "https://script.google.com/XXXXXXX/exec",
  "repositoryUrl": "https://github.com/XXXXXXX/XXXXXXX",
  "rootFolderId": "XXXXXXX",
  "gitHubAccessToken": "XXXXXXX"
}`,
	Run: func(cmd *cobra.Command, args []string) {
		if err := initConfig(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	},
}

func init() {
	rootCmd.AddCommand(initCmd)

	initCmd.Flags().StringVarP(&config, "config", "c", "", "config json path")
	initCmd.Flags().StringVarP(&serviceAccount, "service-account", "s", "", "downloaded google service account json key path")

	initCmd.MarkFlagRequired("config")
	initCmd.MarkFlagRequired("service-account")
}

func initConfig() error {
	viper.SetConfigType("json")
	viper.SetConfigFile(config)
	viper.AutomaticEnv()
	err := viper.ReadInConfig()
	if err != nil {
		return err
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	msDir := filepath.Join(configDir, "MasterBird")
	_ = os.Mkdir(msDir, 0755)
	err = viper.WriteConfigAs(filepath.Join(msDir, "config.json"))
	if err != nil {
		return err
	}

	saBytes, err := ioutil.ReadFile(serviceAccount)
	if err != nil {
		return err
	}
	err = ioutil.WriteFile(filepath.Join(msDir, "service-account.json"), saBytes, 0644)
	if err != nil {
		return err
	}

	return nil
}