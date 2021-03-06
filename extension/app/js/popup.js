window.popupObject = {};

(async () => {
  const [isInitializing, isInitialized] = await Promise.all([
    getBackgroundVariable("isInitializing"),
    getBackgroundVariable("isInitialized"),
  ]);

  const initializeCSS = () => {
    if (matchMedia("(prefers-color-scheme: dark)").matches) {
      $("#selectize").attr("href", "css/selectize.dark.css");
    } else {
      $("#selectize").attr("href", "css/selectize.default.css");
    }
  };

  const initializeTab = async () => {
    const tabContents = $(".tab-content>div");
    const tabButtons = $(".tab-buttons span");
    const lamp = $("#lamp");

    tabContents.hide();

    if (isInitializing || !isInitialized) {
      tabContents.last().slideDown();
      tabButtons.hide();
      lamp.hide();

      return;
    }

    tabContents.first().slideDown();
    tabButtons.map((index, element) => {
      const tabButton = $(element);
      tabButton.click(() => {
        const tabButtonClass = tabButton.attr("class");
        lamp.removeClass().addClass("#lamp").addClass(tabButtonClass);
        tabContents.map((index, element) => {
          const tabContent = $(element);
          if (tabContent.hasClass(tabButtonClass)) {
            tabContent.fadeIn(800);
          } else {
            tabContent.hide();
          }
        });
      });
    });
  };

  const initializeApplySelectizes = () => {
    const selectApplySelectizes = $(".select-apply-selectize");
    selectApplySelectizes.hide();

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (tab.status !== "complete") {
        await closeWithMessage("Wait page loading...");

        return;
      }

      chrome.tabs.sendMessage(tab.id, "", async (response) => {
        if (!response || response.spreadsheets.length === 0) {
          await closeWithMessage("Reload page.");

          return;
        }

        selectApplySelectizes.show();

        popupObject.applySpreadsheetsSelectize = $(
          "#select-apply-spreadsheets"
        ).selectize({
          plugins: ["remove_button"],
          maxItems: null,
          persist: false,
          create: (input) => {
            return {
              value: input,
              text: input,
            };
          },
          options: response.spreadsheets.map((spreadsheet) => ({
            value: spreadsheet.id,
            text: spreadsheet.name,
          })),
        })[0].selectize;

        if (response.spreadsheets.length === 1) {
          popupObject.applySpreadsheetsSelectize.setValue(
            response.spreadsheets[0].id
          );
          popupObject.applySpreadsheetsSelectize.disable();
        }

        popupObject.targetSheetSelectize = $("#select-target-sheet").selectize({
          persist: false,
          create: (input) => {
            return {
              value: input,
              text: input,
            };
          },
          options: response.sheetNames.map((name) => ({
            value: name,
            text: name,
          })),
        })[0].selectize;

        popupObject.mergeSheetsSelectize = $("#select-merge-sheets").selectize({
          plugins: ["remove_button"],
          maxItems: null,
          persist: false,
          create: (input) => {
            return {
              value: input,
              text: input,
            };
          },
          options: response.sheetNames.map((name) => ({
            value: name,
            text: name,
          })),
        })[0].selectize;
      });
    });
  };

  const initializeConfigSelectizes = async () => {
    const selectConfigSelectizes = $(".select-config-selectize");
    selectConfigSelectizes.hide();

    const configObject = await chromeStorage.get([
      "gitHubUsername",
      "gitHubEmail",
      "gitHubAccessToken",
      "configFileId",
      "applyPassword",
      "inputGitHubUsernames",
      "inputGitHubEmails",
      "inputGitHubAccessTokens",
      "inputConfigFileIds",
      "inputApplyPasswords",
    ]);

    if (
      configObject.gitHubUsername &&
      configObject.gitHubEmail &&
      configObject.gitHubAccessToken &&
      configObject.configFileId
    ) {
      if (!isInitializing && !isInitialized) {
        callBackgroundFunction("initialize", {
          gitHubUsername: configObject.gitHubUsername,
          gitHubEmail: configObject.gitHubEmail,
          gitHubAccessToken: configObject.gitHubAccessToken,
          configFileId: configObject.configFileId,
          applyPassword: configObject.applyPassword ?? "",
          callback: () => {},
        });
      }

      if (!isInitialized) {
        await closeWithMessage("Wait initializing...");

        return;
      }
    }

    selectConfigSelectizes.show();

    const initializeConfigSelectize = (
      selectizeName,
      element,
      inputConfigsKey,
      currentConfigKey
    ) => {
      const inputConfigs = configObject[inputConfigsKey] ?? [];
      popupObject[selectizeName] = $(element).selectize({
        persist: false,
        create: (input) => {
          return {
            value: input,
            text: input,
          };
        },
        options: inputConfigs.map((config) => ({
          value: config,
          text: config,
        })),
        onOptionAdd: (value) => {
          inputConfigs.push(value);
          chromeStorage.set({ [inputConfigsKey]: inputConfigs });
          popupObject[selectizeName].addOption({ value: value, text: value });
        },
      })[0].selectize;
      popupObject[selectizeName].setValue(configObject[currentConfigKey]);
    };

    initializeConfigSelectize(
      "gitHubUsernameSelectize",
      "#select-github-username",
      "inputGitHubUsernames",
      "gitHubUsername"
    );
    initializeConfigSelectize(
      "gitHubEmailSelectize",
      "#select-github-email",
      "inputGitHubEmails",
      "gitHubEmail"
    );
    initializeConfigSelectize(
      "gitHubAccessTokenSelectize",
      "#select-github-access-token",
      "inputGitHubAccessTokens",
      "gitHubAccessToken"
    );
    initializeConfigSelectize(
      "configFileIdSelectize",
      "#select-config-file-id",
      "inputConfigFileIds",
      "configFileId"
    );
    initializeConfigSelectize(
      "applyPasswordSelectize",
      "#select-apply-password",
      "inputApplyPasswords",
      "applyPassword"
    );
  };

  const initializeCheckbox = async () => {
    const createPR = (await chromeStorage.get("inputCreatePR"))[
      "inputCreatePR"
    ];
    const checkboxCreatePR = $("#checkbox-create-pr");
    checkboxCreatePR.prop("checked", createPR);
    checkboxCreatePR.change(() =>
      chromeStorage.set({ inputCreatePR: checkboxCreatePR.is(":checked") })
    );
  };

  const initializeButtons = async () => {
    const startLoading = (element, loadingText) => {
      $(element)
        .empty()
        .append(`<i class='fa fa-spinner fa-spin'></i> ${loadingText}`)
        .addClass("btn-progress");
    };

    const stopLoading = (element, defaultText) => {
      $(element).empty().removeClass("btn-progress").append(defaultText);
    };

    if (isInitializing) {
      startLoading("#btn-save", "Saving");
    }

    $("#btn-save").click(async () => {
      if (isInitializing) {
        return;
      }

      const result = await confirmOnBackground("Save?");
      if (result) {
        startLoading("#btn-save", "Saving");
        callBackgroundFunction("initialize", {
          gitHubUsername: popupObject.gitHubUsernameSelectize.items[0],
          gitHubEmail: popupObject.gitHubEmailSelectize.items[0],
          gitHubAccessToken: popupObject.gitHubAccessTokenSelectize.items[0],
          configFileId: popupObject.configFileIdSelectize.items[0],
          applyPassword: popupObject.applyPasswordSelectize.items[0] ?? "",
          callback: () => {
            closeWithMessage("Saved.");
          },
        });
      }
    });

    let isApplying = await getBackgroundVariable("isApplying");
    if (isApplying) {
      startLoading("#btn-apply", "Applying");
    }

    $("#btn-apply").click(async () => {
      if (isApplying) {
        return;
      }
      const isInitializing = await getBackgroundVariable("isInitializing");
      if (isInitializing) {
        await alertOnBackground("Wait initializing...");

        return;
      }
      const isInitialized = await getBackgroundVariable("isInitialized");
      if (!isInitialized) {
        await alertOnBackground("Failed initialize.\nInput config.");

        return;
      }
      if (popupObject.targetSheetSelectize.items.length === 0) {
        await alertOnBackground("Select target sheet.");

        return;
      }

      const result = await confirmOnBackground("Apply?");
      if (result) {
        startLoading("#btn-apply", "Applying");
        callBackgroundFunction("apply", {
          spreadsheetIds: popupObject.applySpreadsheetsSelectize.items,
          targetSheetName: popupObject.targetSheetSelectize.items[0],
          mergeSheetNames: popupObject.mergeSheetsSelectize.items,
          commitMessage: $("#textarea-commit-message").val(),
          parentBranchName: $("#text-parent-branch").val(),
          createPR: $("#checkbox-create-pr").is(":checked"),
          callback: () => {
            stopLoading("#btn-apply", "Apply");
            isApplying = false;
          },
        });
        isApplying = true;
      }
    });
  };

  initializeCSS();
  initializeTab();
  initializeApplySelectizes();
  initializeConfigSelectizes();
  initializeCheckbox();
  initializeButtons();
})();
