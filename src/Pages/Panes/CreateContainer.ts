import { Container } from "./../../Crypto/Container.js";
import { Identity } from "./../../Crypto/Identity.js"
import { $, $$, disableStatus, hideLoader } from "./../../DOM/DOMHelper.js";
import { hashArgon2, hashPBKDF2, getRandomBytes, encrypt, hash, algorithmIvBytes } from "./../../Crypto/CryptoFunctions.js";
import { log } from "./../../Functions.js";
import { EncryptionType, KeyDerivationFunction } from "./../../CustomTypes.js";
import { Pane } from "./Pane.js";
import { Settings } from "../../Extra/Settings/Settings.js";
const Crypto = require("crypto");
const CryptoJS = require("crypto-js");

let container : Container;

/**
 * This container is an abstraction of the 
 */
class CreateContainer extends Pane {
  constructor(container_ : Container) {
    super("create_container_pane", "create_container_button");
    // submit button
    let createContainer = this;
    $("create_container_submitButton").addEventListener("click", () => createContainer.submitListener());
    container = container_;

    // Add argon2 specific listeners
    let argonElements = $$(["create_container_kdf_argon2", "create_container_kdf_PBKDF2", "create_container_argon2_auto_memory"]);
    for (let element = 0; element < argonElements.length; element++) {
      argonElements[element].addEventListener("click", this.argon2_options_listener);
    }

    // add time listener
    $("create_container_time").addEventListener("input", this.time_listener);

    // add calculator listener
    ($("create_container_argon2_memory") as HTMLInputElement).addEventListener("input", calculateMemory);

    // Fire some listeners
    this.argon2_options_listener();
    this.time_listener();
    calculateMemory();

    console.log(CryptoJS);
    hideLoader();
  }

  /**
   * Listener for a button
   */
  argon2_options_listener() {
    let kdf_argon2 = $("create_container_kdf_argon2") as HTMLInputElement;
    let argon2_memory = $("create_container_argon2_memory") as HTMLInputElement;
    let argon2_auto_memory = $("create_container_argon2_auto_memory") as HTMLInputElement;

    if (kdf_argon2.checked) {
      // auto memory
      argon2_auto_memory.disabled = false;

      // memory slider
      argon2_memory.disabled = argon2_auto_memory.checked;
      if (argon2_memory.disabled) argon2_memory.value = "0";
    } else {
      // auto memory
      argon2_auto_memory.disabled = true;
      argon2_auto_memory.checked = false;

      // memory slider
      argon2_memory.value = "0";
      argon2_memory.disabled = true;
    }

    calculateMemory();
  }

  /**
   * Listener for a button
   */
  time_listener() {
    let time_string = "{} second";
    let timeInSeconds = ($("create_container_time") as HTMLInputElement).value;
    time_string += timeInSeconds == "1" ? "." : "s."; //add the "s" to "second".
    $("create_container_time_label").textContent = time_string.replace("{}", timeInSeconds);
    return timeInSeconds;
  }

  /**
   * Click submit button. Assigned to a button
   * @returns nothing. Simply completes and action and is a promise. 
   */
  async submitListener(): Promise<void> {
    //disabled inputs
    disableEverything();

    // get all inputs
    // get ciphers
    let cipher_blowfish = $("create_container_cipher_blowfish") as HTMLInputElement;
    let cipher_aes = $("create_container_cipher_aes") as HTMLInputElement;

    // Get KDFs
    let kdf_argon2 = $("create_container_kdf_argon2") as HTMLInputElement;
    let kdf_PBKDF2 = $("create_container_kdf_PBKDF2") as HTMLInputElement;

    // Get memory and time
    let time = $("create_container_time") as HTMLInputElement;
    let memory = calculateMemory(); //memory in MB


    // get passwords
    let password_once = $("create_container_password_once") as HTMLInputElement;
    let password_twice = $("create_container_password_twice") as HTMLInputElement;

    // Compare
    if (password_once.value != password_twice.value) {
      // TODO: if different throw error

      return;
    }

    let password = password_once.value;

    // TODO: check password is adequate.

    // get values
    let kdf: KeyDerivationFunction;
    let iterations = 10_000_000;

    if (kdf_argon2.checked) kdf = "Argon2";
    else if (kdf_PBKDF2.checked) kdf = "PBKDF2"
    else throw "Could not find specificed algorithm";

    let algorithm: EncryptionType;
    if (cipher_blowfish.checked) algorithm = "Blow";
    else if (cipher_aes.checked) algorithm = "AES";
    else throw "Algorithm not selected";

    let keySize = algorithm != "Blow" ? 32 : 56;


    // Benchmark TODO: move to worker
    let salt = getRandomBytes(keySize);
    let start;
    let end;
    if (kdf == "Argon2") {
      // current memory is in MB, need to convert it to MiB
      memory = memory * 1024; // KB
      memory = memory * 1024; // Bytes
      memory = memory / 1000; // KiB
      memory = Math.round(memory);

      salt = Crypto.randomBytes(keySize);
      iterations = 100;

      start = performance.now();
      await hashArgon2(memory, iterations, salt, keySize, password);
      end = performance.now();

    } else if (kdf == "PBKDF2") {
      start = performance.now();
      hashPBKDF2(iterations, salt, keySize, password);
      end = performance.now();

    } else throw "Could not find specificed algorithm";

    // output result
    let timeTaken = end - start;
    let targetTime = Number.parseFloat(time.value) * 1000;
    let timeScale = targetTime / timeTaken;
    let result = "Took {time}ms to hash {its} iterations.";

    result += "\nAssuming {new} ({scale} scale) will take {new_time}ms";
    result = result.replace("{time}", (Math.round((timeTaken) * 10) / 10).toString());
    result = result.replace("{its}", iterations.toString());

    iterations = Math.round(timeScale * iterations); // calculate iterations

    result = result.replace("{new}", iterations.toString());
    result = result.replace("{scale}", timeScale.toString());
    result = result.replace("{new_time}", targetTime.toString());

    if (kdf == "Argon2" && iterations < 5) {
      result += " However, due to the dangerously low amount of rounds, I raised the rounds to 5. It seems like this will take ~{sec} seconds. I could be wrong.";
      result = result.replace("{sec}", (Math.round(targetTime * (5 / iterations)) / 10).toString());
      iterations = 5;
    }

    log(result);

    // Make container data
    let ivSize = algorithmIvBytes(algorithm);
    let containerIv = getRandomBytes(ivSize);

    // make first identity
    let identityData = JSON.stringify({
      "accounts": [],
      "identityDesc": "Default Identity, feel free to edit this.",
      "identityName": "Default",
    });

    let masterKey = Crypto.randomBytes(keySize);

    let defaultIdentity = new Identity(identityData);

    container.identities = [defaultIdentity];
    container.settings = new Settings();
    container.iv = containerIv;
    container.encryptionType = algorithm;
    container.dataHash = encrypt(algorithm, masterKey, containerIv, hash(masterKey));

    // create slot
    await container.addSlot(password, algorithm, iterations, kdf, memory, masterKey);
    container.externalMasterKey = null;
    log(container);

    // Test container
    await container.unlock(password);
    log(container.isEmpty);
    log(container.openSlot == null);

    // Test contaner data
    let ids = container.getIdentites();
    console.log(ids);

    container.save();
    this.onChange(container);
  }

  updatePane() { }
}

/**
 * Disables every element on the pane
 */
function disableEverything() {
  let objects = $$(
    ["create_container_cipher_blowfish",
      "create_container_cipher_aes",
      "create_container_kdf_argon2",
      "create_container_kdf_PBKDF2",
      "create_container_time",
      "create_container_argon2_memory",
      "create_container_argon2_auto_memory",
      "create_container_password_once",
      "create_container_password_twice",
      "create_container_submitButton"
    ]
  );

  disableStatus(objects as HTMLInputElement[], true);

  let benchmarkScreen = $("create_container_benchmarkScreen");
  benchmarkScreen.style.opacity = "1";
}

/**
 * Formula: {@link https://www.desmos.com/calculator/pchhyi5zfu desmos.com}.
 * @param x slider input
 * @returns memory in GB
 */
function calculateMemoryFunction(x: number) {
  
  let a = 2 ** 0.25;
  return a ** (x - 9) / 5;
}

/**
 * calculate memory amount and sets label.
 * @returns memory in bytes.
 */
function calculateMemory() {
  // Find system memory
  let memory_amount_notifier = $("create_container_memory_amount_notifier");
  let argon2_memory = $("create_container_argon2_memory") as HTMLInputElement;
  let memory_label_string = "We will use {} of memory.";

  let memory_amount;

  if (!($("create_container_kdf_argon2") as HTMLInputElement).checked) {
    // not the argon2 algorithm
    memory_amount = 1 / 1024; //1MB
  } else if (($("create_container_argon2_auto_memory") as HTMLInputElement).checked) {
    // calculate memory automatically (0.25, 0.5, 1, 2, 4 & 8 gigabytes)
    let memoryInGB = (navigator as any).deviceMemory as number; // manual override for TS

    // get lowerbound
    memory_amount = memoryInGB / 2;

  } else {
    // get memory from slider
    memory_amount = Number.parseFloat(argon2_memory.value);
    memory_amount = calculateMemoryFunction(memory_amount);
  }

  let max_memory_amount = calculateMemoryFunction(20);
  memory_amount = Math.min(memory_amount, max_memory_amount);

  console.log("Memory calculated: " + memory_amount);

  let memory_amount_formatted = memory_amount > 1 ?
    Math.round(memory_amount * 10) / 10 + "Gb" :
    Math.round(memory_amount * 1024) + "Mb";

  memory_amount_notifier.textContent = memory_label_string.replace("{}", memory_amount_formatted);

  return memory_amount * 1024;
}

export { CreateContainer };
