import { Container, getStoredContainer, storageHasContainer } from "../Crypto/Container.js";
import { $, $$, $$$, removeAllChildren, disableStatus } from "../DOM/DOMHelper.js";
import { DOMAlert } from "../DOM/DOMAlert.js";
import { Identity } from "../Crypto/Identity.js";
import { Account } from "../Account.js";
import { log } from "../Functions.js";
import { PaneManager } from "../DOM/PaneManager.js";
import { BIP } from "../Recovery/BIP.js";
import { ShamirChunk, generateBIPs } from "../Recovery/Shamir.js";
import { LoginPane } from "./Panes/LoginPane.js";
import { WordRecovery } from "./Panes/WordRecovery.js";
import { SharedRecovery } from "./Panes/SharedRecovery.js";
import { CreateContainer } from "./Panes/CreateContainer.js";
import { SettingsPane } from "./Panes/SettingsPane.js";
import { State } from "./../CustomTypes.js";

// state
let state = "login" as State;

// panes
let settingsPane: SettingsPane;

// encrypted container and identity
var container : Container;
if (!storageHasContainer()) {
  state = "create_container";
  container = new Container();
}
else {
  try {
    container = getStoredContainer();
    //TODO: Warn user of new container or data loss. Save it somewhere maybe.
  } catch {
    state = "create_container";
    container = new Container();
  }
}

var currentIdentity = 0;

// a place for notifications
var notification_container = $("notification_container");

// recovery
var Bip = new BIP();

// buttons
let create_pane_buttons = ["create_container_button"];
let login_pane_buttons = ["login_pane_button", "word_recovery_button", "shared_recovery_button"];
let password_manager_pane_buttons = ["home_pane_button", "identity_pane_button", "settings_pane_button", "recovery_pane_button"];

function setAllButtonsDisabled() {
  let everything = $$$(login_pane_buttons, password_manager_pane_buttons, create_pane_buttons);

  // add disabled to groups
  for (let index = 0; index < everything.length; index++) {
    everything[index].classList.add("disabled");
    everything[index].parentElement?.classList.add("disabled");
  }
}

function removeDisabledFromButtons(element: HTMLElement[]) {
  for (let index = 0; index < element.length; index++) {
    element[index].classList.remove("disabled");
    element[index].parentElement?.classList.remove("disabled");
  }
}

function updateState() {
  setAllButtonsDisabled();
  switch (state) {
    case "create_container": {
      removeDisabledFromButtons($$(create_pane_buttons));
      return;
    }
    case "login": {
      // remove disabled from groups
      removeDisabledFromButtons($$(login_pane_buttons));
      return;
    }
    case "password_manager": {
      removeDisabledFromButtons($$(password_manager_pane_buttons));
      return;
    }
  }
}

export class PasswordManager {
  identities?: Identity[];
  paneManager: PaneManager;
  constructor() {
    // Assign listeners...
    $("logout").addEventListener("click", this.logout);
    $("reveal_bip").addEventListener("click", revealBip);
    $("generate_shared_recovery").addEventListener("click", createSharedRecovery);

    // add pane manager
    let paneManagerMappings = {
      "login_pane_button": "login_pane",
      "home_pane_button": "home_pane",
      "word_recovery_button" : "word_recovery_pane",
      "shared_recovery_button" : "shared_recovery_pane",
      "create_container_button" : "create_container_pane",
      "identity_pane_button": "identity_pane",
      "settings_pane_button": "settings_pane",
      "recovery_pane_button": "recovery_pane",
    };

    this.paneManager = new PaneManager(paneManagerMappings);

    // start extenral panes
    let createContainerPane = new CreateContainer(container);
    createContainerPane.addChangeListener((container_ : Container) => containerCreated(container_));
    
    if(state != "create_container"){
      createPanes();
      $("login_pane_button").click();
    } else {
      $("create_container_button").click();
    }

    updateState();
  }

  logout() {
    // close electron
    if(state == "login" || state == "create_container") {
      window.close();
    }

    // move to login state
    container.save(); // update and lock the container
    container.lock();

    // change state
    state = "login";
    updateState();

    // show login
    $("login_pane_button").click();
  }
}

function showLoader() {
  $("loader").style.opacity = "1";
  $("loader").style.zIndex = "999";
}

function hideLoader() {
  $("loader").style.opacity = "0";
  $("loader").style.zIndex = "-999";
}

function containerCreated(container_ : Container) {
  container = container_;
  createPanes();
  containerUnlocked();
}

function createPanes() {
  let loginPane = new LoginPane(container);
  loginPane.addChangeListener(containerUnlocked);
  loginPane.setOnLoadingFinishedAction(hideLoader);
  loginPane.setOnLoadingStartedAction(showLoader);

  let wordRecoveryPane = new WordRecovery(container, Bip);
  wordRecoveryPane.addChangeListener(containerUnlocked);

  let sharedRecoveryPane = new SharedRecovery(container, Bip);
  sharedRecoveryPane.addChangeListener(containerUnlocked);

  settingsPane = new SettingsPane(container);
  settingsPane.addChangeListener(updateEverything);
  settingsPane.updatePane();
}

function containerUnlocked() {
  // hide the loading spinner
  hideLoader();

  // create accounts and display them
  createEverything();

  // set the state to be the password manager state
  state = "password_manager";
  updateState();

  settingsPane.updateTheme();

  // open the home pane
  $("home_pane_button").click();
}

function createEverything() {
  // add creations
  createIdentityPane();
  createHomePane();
  createSharedRecoveryPane();

  // fill panes with info
  updateEverything();
}

function updateEverything() {
  settingsPane.updatePane();
  settingsPane.updateTheme();
  updateIdentityPane();
  updateHomePane();
}

let account = 0;
function createHomePane() {
  // Add listeners
  // add account
  $("add_account").addEventListener("click", createAccount);

  // add change listener
  $("account_website").addEventListener("input", saveAccountChanges);
  $("account_username").addEventListener("input", saveAccountChanges);
  $("account_password").addEventListener("input", saveAccountChanges);

  // Toggle to show password
  $("account_show_password").addEventListener("change", () => {
    ($("account_password") as HTMLInputElement).type = ($("account_show_password") as HTMLInputElement).checked ? "text" : "password";
  });

  // Delete account
  $("account_delete").addEventListener("click", removeAccount);

  // add search
  $("search_home").addEventListener("input", () => { updateHomePane() });

  updateHomePane();
}

function accountSearchMatch(accountObject: Account, searchString: string) {
  searchString = searchString.trim().toLocaleLowerCase();
  if (searchString == "") return true;

  let login = accountObject.login.trim().toLocaleLowerCase();
  let website = accountObject.website.trim().toLocaleLowerCase();
  return login.includes(searchString) || website.includes(searchString);
}

/* account entry should look like this
<a href="#" class="list-group-item list-group-item-action py-3 lh-tight">
  <div class="d-flex w-100 align-items-center justify-content-between">
    <strong class="mb-1">Website</strong>
    //<small class="text-muted">Tues</small>
  </div>
  <div class="col-10 mb-1 small">Email</div>
</a>
*/

/* empty field should look like this
<div class="d-block my-auto small text-center text-muted">No accounts in identity.</div>
*/
function updateHomePane(updateAccountToo = true) {
  log("update home page. ");
  let account_space = $("account_space");

  let searchString = ($("search_home") as HTMLInputElement).value;

  // clear
  removeAllChildren(account_space);

  // create entries
  let identity = container.getIdentites()[currentIdentity];
  let accounts = identity.accounts;

  // check data
  account = accounts.length <= account ? accounts.length - 1 : (account < 0 ? 0 : account);

  let validAccounts = [];
  let currentAccountInvalid = false;
  for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
    // get the account
    let accountObject = accounts[accountIndex];
    if (accountSearchMatch(accountObject, searchString)) validAccounts.push(accountIndex);
    else currentAccountInvalid = currentAccountInvalid || accountIndex == account;
  }

  log("valid accounts: ");
  log(validAccounts);

  if (currentAccountInvalid) {
    if (validAccounts.length > 0) account = validAccounts[0]; // if the current account is invalid, return the first instance of a valid account
    else account = 0; // or just 0 when there is nothing.
  }

  log("account number: " + account);

  if (validAccounts.length == 0 && currentAccountInvalid) {
    // there is nothing valid
    let emptyAccountNotif = document.createElement("div");
    emptyAccountNotif.classList.add("d-block", "my-auto", "small", "text-center", "text-muted");
    emptyAccountNotif.textContent = "No accounts matching search term '" + searchString + "' in identity '" + identity.identityName + "'";
    account_space.appendChild(emptyAccountNotif);

  } else if (accounts.length == 0) {
    // there is no accounts
    let emptyAccountNotif = document.createElement("div");
    emptyAccountNotif.classList.add("d-block", "my-auto", "small", "text-center", "text-muted");
    emptyAccountNotif.textContent = "No accounts in identity '" + identity.identityName + "'";
    account_space.appendChild(emptyAccountNotif);

  } else {
    // fill them with data
    for (let validAccountsIndex = 0; validAccountsIndex < validAccounts.length; validAccountsIndex++) {
      // get the account
      let accountIndex = validAccounts[validAccountsIndex];
      let accountObject = accounts[accountIndex];

      // make elements
      let a = document.createElement("a");
      a.href = "#";
      a.classList.add("list-group-item", "list-group-item-action", "py-3", "lh-tight");
      if (accountIndex == account) a.classList.add("active");

      let divTop = document.createElement("div");
      divTop.classList.add("d-flex", "w-100", "align-items-center", "justify-content-between");

      let divTopStrong = document.createElement("strong");
      divTopStrong.classList.add("mb-1");
      divTopStrong.textContent = accountObject.website;

      divTop.appendChild(divTopStrong);
      a.appendChild(divTop);

      let divBottom = document.createElement("div");
      divBottom.classList.add("col-10", "mb-1", "small");
      divBottom.textContent = accountObject.login;

      a.appendChild(divBottom);

      // add event listener
      a.addEventListener("click", () => {
        account = accountIndex;
        log("Changed account number to: " + account);
        updateHomePane();
      })

      account_space.appendChild(a);
    }
  }

  if (updateAccountToo) updateAccountPane();
}

function updateAccountPane() {
  // get data
  let identity = container.getIdentites()[currentIdentity];
  log(identity);

  let accounts = identity.accounts;
  log(accounts);

  let currentAccount = accounts[account];
  log(currentAccount);

  let account_website = $("account_website") as HTMLInputElement;
  let account_username = $("account_username") as HTMLInputElement;
  let account_password = $("account_password") as HTMLInputElement;
  let account_show_password = $("account_show_password") as HTMLInputElement;
  let account_delete = $("account_delete") as HTMLInputElement;

  let toDisable = [account_website, account_username, account_password, account_show_password, account_delete];

  // make off by default
  account_show_password.checked = false;

  if (accounts.length == 0) {
    // disable them and clear them
    disableStatus(toDisable, true);

  } else {
    // enable them 
    disableStatus(toDisable, false);

    // fill them with data
    account_website.value = currentAccount.website;
    account_username.value = currentAccount.login;
    account_password.value = currentAccount.password;
  }
}

function saveAccountChanges() {
  // get data
  let identity = container.getIdentites()[currentIdentity];
  let accounts = identity.accounts;
  let currentAccount = accounts[account];

  log("saving account number: " + account);

  let account_website = $("account_website") as HTMLInputElement;
  let account_username = $("account_username") as HTMLInputElement;
  let account_password = $("account_password") as HTMLInputElement;

  currentAccount.website = account_website.value;
  currentAccount.login = account_username.value;
  currentAccount.password = account_password.value;

  container.save();
  updateHomePane(false);
}

function createAccount() {
  log("create account");
  // get data
  let identity = container.getIdentites()[currentIdentity];
  let accounts = identity.accounts;

  let newAccount = new Account();
  accounts.push(newAccount);

  account = accounts.length - 1;

  container.save(); // save new account

  updateHomePane();
}

function removeAccount() {
  let identity = container.getIdentites()[currentIdentity];
  log("deleted: ");
  log(identity.accounts.splice(account, 1));

  container.save() // save deleted account

  account--;
  updateHomePane();
}

function createIdentityPane() {
  log(createIdentityPane);
  $("identity_select").addEventListener("change", changeIdentity);
  $("add_identity_button").addEventListener("click", addIdentity);
  $("remove_identity_button").addEventListener("click", removeCurrentIdentity);
  $("edit_identity_form_name").addEventListener("input", identityUpdate);
  $("edit_identity_form_desc").addEventListener("input", identityUpdate);
}

function updateIdentityPane() {
  log("updateIdentityPane");
  //get identities
  let identities = container.getIdentites();
  let CurrentIdentity = identities[currentIdentity];

  // set identity data
  ($("edit_identity_form_name") as HTMLInputElement).value =
    $("pane_identity_field_name").textContent =
    CurrentIdentity.identityName;

  ($("edit_identity_form_desc") as HTMLInputElement).value =
    $("pane_identity_field_desc").textContent =
    CurrentIdentity.identityDesc;

  // remove old identities
  let identity_select = $("identity_select") as HTMLSelectElement;
  removeAllChildren(identity_select);

  // populate the select
  for (let index = 0; index < identities.length; index++) {
    let selectOption = document.createElement("option");
    selectOption.textContent = identities[index].identityName;
    selectOption.value = index.toString();
    identity_select.appendChild(selectOption);
  }

  identity_select.options[currentIdentity].selected = true;

  updateHomePane();
}

function changeIdentity() {
  let identity_select = $("identity_select") as HTMLSelectElement;
  currentIdentity = Number.parseInt(identity_select.options[identity_select.selectedIndex].value);
  updateIdentityPane();
}

function addIdentity() {
  let identityName = ($("add_identity_form_name") as HTMLInputElement).value;
  let identityDesc = ($("add_identity_form_desc") as HTMLInputElement).value;

  let identityData = {
    "accounts": [],
    "identityName": identityName,
    "identityDesc": identityDesc,
  }

  let identityObject = new Identity(JSON.stringify(identityData));
  try {
    container.addIdentity(identityObject);
    new DOMAlert("success", "Added new identity: " + identityObject.identityName, notification_container);
  } catch (error) {
    new DOMAlert("warning", "Failed to add identity", notification_container);
  }

  updateIdentityPane();
}

function removeCurrentIdentity() {
  log("removeCurrentIdentity");
  try {
    if (container.identities == null) throw "Identities are null";
    if (container.identities.length == 1) throw "This is the only identity";
    container.removeIdentity(currentIdentity);
    currentIdentity = 0;
    new DOMAlert("success", "Removed current identity", notification_container);
  } catch (error) {
    new DOMAlert("danger", error, notification_container);
  }
  updateIdentityPane();
}

function identityUpdate() {
  log("identityUpdate");
  try {
    if (container.identities == null) throw "Container is null";
    container.identities[currentIdentity].identityName = ($("edit_identity_form_name") as HTMLInputElement).value;
    container.identities[currentIdentity].identityDesc = ($("edit_identity_form_desc") as HTMLInputElement).value;
    container.save();
  } catch (error) {
    new DOMAlert("warning", "Could not update container:\n" + error, notification_container);
  }

  updateIdentityPane();
}

var bipRevealed = false;
function revealBip() {
  if (bipRevealed) return;
  bipRevealed = true;

  let words = Bip.generateFromUint8Array(container.getMasterKey());
  let bip = $("bip");
  removeAllChildren(bip);

  for (let word = 0; word < words.length; word++) {
    let currentWord = words[word];

    let bipElement = document.createElement("p");
    bipElement.classList.add("mx-3");
    if (currentWord.underlined) bipElement.classList.add("text-decoration-underline");
    bipElement.textContent = (word + 1) + ". " + currentWord.text;

    bip.appendChild(bipElement);
  }

  $("reveal_bip").remove();
}

function sharedRecoveryUpDownEvent() {
  log("sharedRecoveryUpDownEvent");
  let pieces = $("recovery_pieces") as HTMLInputElement;
  let threshold = $("recovery_threshold") as HTMLInputElement;
  let piecesValue = Number.parseInt(pieces.value);
  let thresholdValue = Number.parseInt(threshold.value);

  // ensure minimum
  piecesValue = piecesValue < 2 ? 2 : piecesValue;
  thresholdValue = thresholdValue < 2 ? 2 : thresholdValue;

  // make sure that threshold is at least pieces
  thresholdValue = thresholdValue > piecesValue ? piecesValue : thresholdValue;

  // return values
  pieces.value = piecesValue.toString();
  threshold.value = thresholdValue.toString();
}

function createSharedRecoveryPane() {
  // up down change
  $("recovery_pieces").addEventListener("change", sharedRecoveryUpDownEvent);
  $("recovery_threshold").addEventListener("change", sharedRecoveryUpDownEvent);

  // previous next
  $("generate_shared_recovery_previous").addEventListener("click", sharedRecoveryPrevious);
  $("generate_shared_recovery_next").addEventListener("click", sharedRecoveryNext);
}

var shamirChunks = null as null | ShamirChunk[];
function createSharedRecovery() {
  // get data and make
  log("createSharedRecovery");
  let pieces = $("recovery_pieces") as HTMLInputElement;
  let threshold = $("recovery_threshold") as HTMLInputElement;
  let piecesValue = Number.parseInt(pieces.value);
  let thresholdValue = Number.parseInt(threshold.value);
  let masterKey = container.getMasterKey();

  log("mk:");
  log(masterKey);
  log("pieces: " + piecesValue);
  log("thresh: " + thresholdValue);

  shamirChunks = generateBIPs(masterKey, piecesValue, thresholdValue);
  log(shamirChunks);

  // make fields visible
  $("generate_shared_recovery_screen").classList.remove("d-none");
  updateRecoveryScreen();
}

function updateRecoveryScreen() {
  checkRecoveryPage();
  if (shamirChunks == null) throw "shamirChunks are undefined";
  log("updateRecoveryScreen p:" + page);

  // make
  let shamirChunk = shamirChunks[page];
  let words = shamirChunk.makeBIP(Bip);

  // assign
  $("generate_shared_recovery_title").textContent = "Piece number: " + shamirChunk.part.toString();
  let bipDiv = $("generate_shared_recovery_bip");
  removeAllChildren(bipDiv);

  // display
  for (let word = 0; word < words.length; word++) {
    let currentWord = words[word];

    let bipElement = document.createElement("p");
    bipElement.classList.add("mx-3");
    if (currentWord.underlined) bipElement.classList.add("text-decoration-underline");
    bipElement.textContent = (word + 1) + ". " + currentWord.text;

    bipDiv.appendChild(bipElement);
  }
}

var page = 0;
function sharedRecoveryNext() {
  log("sharedRecoveryNext");
  page++;
  updateRecoveryScreen();
}

function sharedRecoveryPrevious() {
  log("sharedRecoveryNext");
  page--;
  updateRecoveryScreen();
}

function checkRecoveryPage() {
  let next = $("generate_shared_recovery_next") as HTMLInputElement;
  let previous = $("generate_shared_recovery_previous") as HTMLInputElement;
  previous.disabled = next.disabled = false;

  if (shamirChunks == null) page = 0;
  else {
    page = page < 0 ? 0 : page;
    page = page >= shamirChunks.length ? shamirChunks.length - 1 : page;

    next.disabled = page == shamirChunks.length - 1; // last page
    previous.disabled = page == 0; //first page
  }
}

