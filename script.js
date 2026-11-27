(() => {
  "use strict";

  const MAX_ITEMS = 5;
  const STORAGE_KEY = "pt210RepairReceipt";
  const HISTORY_STORAGE_KEY = "pt210RepairReceiptHistory";
  const LEGACY_STORAGE_KEY = "mobileCareReceipt";
  const currency = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const itemList = document.getElementById("itemList");
  const statusSelect = document.getElementById("repairStatus");
  const paymentAmount = document.getElementById("paymentAmount");
  const notice = document.getElementById("notice");
  const historyDialog = document.getElementById("receiptHistoryDialog");
  const historyList = document.getElementById("historyList");
  const historySearch = document.getElementById("historySearch");
  const historyStatus = document.getElementById("historyStatus");
  let historyRecords = [];
  let historyError = "";
  let suppressDraftSave = false;

  function formatMoney(amount) {
    return currency.format(amount);
  }

  function getItemRows() {
    return Array.from(itemList.querySelectorAll(".item-row"));
  }

  function getItemsTotal() {
    return getItemRows().reduce((sum, row) => {
      const amount = Number(row.querySelector(".item-price").value);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
  }

  function setNotice(message) {
    notice.textContent = message;
  }

  function formatDateForPrint(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-PH").format(new Date(year, month - 1, day));
  }

  function updatePrintValues() {
    document.getElementById("printCustomer").textContent =
      document.getElementById("custName").value.trim();
    document.getElementById("printSaleDate").textContent =
      formatDateForPrint(document.getElementById("saleDate").value);
    document.getElementById("printWarrantyDate").textContent =
      formatDateForPrint(document.getElementById("warrantyDate").value);
    document.getElementById("printPhoneBrand").textContent =
      document.getElementById("phoneBrand").value.trim();
    document.getElementById("printComments").textContent =
      document.getElementById("comments").value.trim();
    document.getElementById("printStatus").textContent =
      statusSelect.value === "DOWN PAYMENT" ? "DOWN PAYMENT" : "PAID";
  }

  function getReceiptData() {
    return {
      name: document.getElementById("custName").value,
      saleDate: document.getElementById("saleDate").value,
      status: statusSelect.value,
      warrantyDate: document.getElementById("warrantyDate").value,
      phoneBrand: document.getElementById("phoneBrand").value,
      comments: document.getElementById("comments").value,
      paymentAmount: paymentAmount.value,
      items: getItemRows().map((row) => ({
        name: row.querySelector(".item-name").value,
        price: row.querySelector(".item-price").value
      }))
    };
  }

  function saveData() {
    updatePrintValues();
    if (suppressDraftSave) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getReceiptData()));
    } catch (error) {
      console.error("Could not save the receipt in this browser.", error);
      setNotice("This browser could not save the receipt. You can still print it.");
    }
  }

  function updateReceipt() {
    const total = getItemsTotal();
    const isDownPayment = statusSelect.value === "DOWN PAYMENT";
    const isPaid = statusSelect.value === "PAID";
    const enteredPayment = Number(paymentAmount.value);
    const payment = isPaid
      ? total
      : isDownPayment && Number.isFinite(enteredPayment)
        ? Math.min(Math.max(enteredPayment, 0), total)
        : 0;
    const balance = Math.max(total - payment, 0);

    document.getElementById("itemsTotal").textContent = formatMoney(total);
    document.getElementById("balanceDue").textContent = formatMoney(balance);
    document.getElementById("balanceLabel").textContent = isPaid ? "Balance" : "Balance due";
    document.getElementById("paymentField").hidden = !isDownPayment;
    document.getElementById("paymentLine").hidden = !isDownPayment;
    document.getElementById("paymentDisplay").textContent = formatMoney(payment);
    updatePrintValues();
    setNotice("");
    saveData();
  }

  function addItemRow(item = {}) {
    if (getItemRows().length >= MAX_ITEMS) {
      setNotice(`You can add up to ${MAX_ITEMS} items.`);
      return;
    }

    const row = document.createElement("div");
    row.className = "item-row";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "item-name";
    nameInput.placeholder = "Item or service";
    nameInput.maxLength = 40;
    nameInput.setAttribute("aria-label", "Item or service");
    nameInput.value = item.name || "";

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.className = "item-price";
    priceInput.placeholder = "0.00";
    priceInput.min = "0";
    priceInput.step = "0.01";
    priceInput.inputMode = "decimal";
    priceInput.setAttribute("aria-label", "Item price in pesos");
    priceInput.value = item.price || "";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-item no-print";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "Remove item");
    removeButton.addEventListener("click", () => {
      row.remove();
      updateReceipt();
    });

    nameInput.addEventListener("input", saveData);
    priceInput.addEventListener("input", updateReceipt);
    row.append(nameInput, priceInput, removeButton);
    itemList.appendChild(row);
  }

  function isReceiptData(data) {
    return Boolean(
      data &&
      typeof data === "object" &&
      typeof data.name === "string" &&
      data.name.trim() &&
      typeof data.saleDate === "string" &&
      ["DOWN PAYMENT", "PAID"].includes(data.status) &&
      typeof data.warrantyDate === "string" &&
      typeof data.phoneBrand === "string" &&
      typeof data.comments === "string" &&
      typeof data.paymentAmount === "string" &&
      Array.isArray(data.items) &&
      data.items.length <= MAX_ITEMS &&
      data.items.every((item) =>
        item &&
        typeof item.name === "string" &&
        typeof item.price === "string"
      )
    );
  }

  function isHistoryRecord(record) {
    return Boolean(
      record &&
      typeof record === "object" &&
      typeof record.id === "string" &&
      typeof record.savedAt === "string" &&
      Number.isFinite(Date.parse(record.savedAt)) &&
      isReceiptData(record.data)
    );
  }

  function loadHistory() {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!saved) {
        historyRecords = [];
        historyError = "";
        return;
      }

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) {
        throw new TypeError("Saved receipt history is not a list.");
      }

      historyRecords = parsed.filter(isHistoryRecord);
      historyError = historyRecords.length === parsed.length
        ? ""
        : "Some saved history entries were invalid and have been excluded.";
      if (historyError) {
        console.error("Some saved receipt history entries are invalid.");
      }
    } catch (error) {
      console.error("Could not load receipt history.", error);
      historyRecords = [];
      historyError = "Receipt history could not be loaded from this browser.";
    }
  }

  function getHistorySearchText(record) {
    const data = record.data;
    return [
      data.name,
      data.saleDate,
      formatDateForPrint(data.saleDate),
      formatSavedAt(record.savedAt),
      data.phoneBrand,
      data.comments,
      ...data.items.map((item) => item.name)
    ].join(" ").toLowerCase();
  }

  function formatSavedAt(value) {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function renderHistory() {
    const query = historySearch.value.trim().toLowerCase();
    const matches = historyRecords.filter((record) =>
      getHistorySearchText(record).includes(query)
    );
    historyList.replaceChildren();
    historyStatus.textContent = historyError ||
      `${matches.length} ${matches.length === 1 ? "receipt" : "receipts"} found`;

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = query
        ? "No receipts match that search."
        : "No receipts have been printed from this browser yet.";
      historyList.appendChild(empty);
      return;
    }

    matches.forEach((record) => {
      const data = record.data;
      const total = data.items.reduce((sum, item) => {
        const price = Number(item.price);
        return sum + (Number.isFinite(price) && price > 0 ? price : 0);
      }, 0);
      const enteredPayment = Number(data.paymentAmount);
      const payment = data.status === "PAID"
        ? total
        : Number.isFinite(enteredPayment)
          ? Math.min(Math.max(enteredPayment, 0), total)
          : 0;
      const card = document.createElement("article");
      card.className = "history-card";

      const header = document.createElement("div");
      header.className = "history-card-header";
      const details = document.createElement("div");
      const customer = document.createElement("h3");
      customer.textContent = data.name;
      const subtitle = document.createElement("p");
      subtitle.className = "history-card-subtitle";
      subtitle.textContent = [
        formatDateForPrint(data.saleDate) || "Date not set",
        data.phoneBrand.trim(),
        data.comments.trim(),
        data.items.map((item) => item.name.trim()).filter(Boolean).join(", ")
      ].filter(Boolean).join(" · ");
      details.append(customer, subtitle);

      const reprintButton = document.createElement("button");
      reprintButton.type = "button";
      reprintButton.className = "button button-secondary history-reprint";
      reprintButton.textContent = "Print again";
      reprintButton.addEventListener("click", () => printHistoryRecord(record));
      header.append(details, reprintButton);

      const summary = document.createElement("p");
      summary.className = "history-card-summary";
      summary.textContent =
        `${data.status === "PAID" ? "Paid" : "Down payment"} · ` +
        `Total ${formatMoney(total)} · Balance ${formatMoney(Math.max(total - payment, 0))}`;

      const savedAt = document.createElement("p");
      savedAt.className = "history-card-time";
      savedAt.textContent = `Saved ${formatSavedAt(record.savedAt)}`;
      card.append(header, summary, savedAt);
      historyList.appendChild(card);
    });
  }

  function saveHistoryRecord(data) {
    if (!isReceiptData(data)) {
      setNotice("Enter a customer name before saving this receipt to history.");
      return false;
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      data
    };
    const nextRecords = [record, ...historyRecords];

    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextRecords));
      historyRecords = nextRecords;
      historyError = "";
      renderHistory();
      return true;
    } catch (error) {
      console.error("Could not save receipt history in this browser.", error);
      historyError = "This browser could not save receipt history.";
      setNotice("The receipt will print, but it could not be saved to history.");
      renderHistory();
      return false;
    }
  }

  function applyReceiptData(data) {
    document.getElementById("custName").value = data.name;
    document.getElementById("saleDate").value = data.saleDate;
    document.getElementById("warrantyDate").value = data.warrantyDate;
    document.getElementById("phoneBrand").value = data.phoneBrand;
    document.getElementById("comments").value = data.comments;
    statusSelect.value = data.status;
    paymentAmount.value = data.paymentAmount;
    itemList.replaceChildren();
    data.items.forEach((item) => addItemRow(item));
    if (getItemRows().length === 0) addItemRow();
  }

  function printHistoryRecord(record) {
    if (!isHistoryRecord(record)) {
      setNotice("This saved receipt is invalid and cannot be printed.");
      return;
    }

    const currentData = getReceiptData();
    suppressDraftSave = true;
    applyReceiptData(record.data);
    updateReceipt();
    historyDialog.close();

    const restoreCurrentReceipt = () => {
      applyReceiptData(currentData);
      updateReceipt();
      suppressDraftSave = false;
    };
    window.addEventListener("afterprint", restoreCurrentReceipt, { once: true });

    try {
      window.print();
    } catch (error) {
      window.removeEventListener("afterprint", restoreCurrentReceipt);
      restoreCurrentReceipt();
      console.error("Could not print the saved receipt.", error);
      setNotice("The saved receipt could not be opened for printing.");
    }
  }

  function loadData() {
    let data;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!saved) return;
      data = JSON.parse(saved);
    } catch (error) {
      console.error("Could not load the saved receipt.", error);
      setNotice("The saved receipt could not be loaded. Start a new receipt.");
      return;
    }

    if (!data || typeof data !== "object") {
      setNotice("The saved receipt is invalid. Start a new receipt.");
      return;
    }

    const items = Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS) : [];
    applyReceiptData({
      name: typeof data.name === "string" ? data.name : "",
      saleDate: typeof data.saleDate === "string" ? data.saleDate : "",
      status: ["DOWN PAYMENT", "PAID"].includes(data.status)
        ? data.status
        : "DOWN PAYMENT",
      warrantyDate: typeof data.warrantyDate === "string" ? data.warrantyDate : "",
      phoneBrand: typeof data.phoneBrand === "string" ? data.phoneBrand : "",
      comments: typeof data.comments === "string" ? data.comments : "",
      paymentAmount: data.paymentAmount ? String(data.paymentAmount) : "",
      items: items.map((item) => ({
        name: item && item.name ? String(item.name) : "",
        price: item && item.price ? String(item.price) : ""
      }))
    });
    updateReceipt();
  }

  function resetForm() {
    document.getElementById("custName").value = "";
    document.getElementById("saleDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("warrantyDate").value = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    document.getElementById("phoneBrand").value = "";
    document.getElementById("comments").value = "";
    statusSelect.value = "DOWN PAYMENT";
    paymentAmount.value = "";
    itemList.replaceChildren();
    addItemRow();
    setNotice("");
    updateReceipt();
  }

  function showNewReceiptConfirmation() {
    document.getElementById("newReceiptDialog").showModal();
  }

  function registerServiceWorker() {
    if (location.protocol === "file:") return;
    if (!("serviceWorker" in navigator)) {
      setNotice("Offline caching is not supported by this browser.");
      return;
    }

    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Could not enable offline caching.", error);
      setNotice("Offline caching requires HTTPS and hosting that supports service workers.");
    });
  }

  function printReceipt() {
    const data = getReceiptData();
    if (!data.name.trim()) {
      setNotice("Enter the customer name before printing.");
      document.getElementById("custName").focus();
      return;
    }
    updateReceipt();
    saveHistoryRecord(data);
    window.print();
  }

  document.getElementById("addItemButton").addEventListener("click", () => addItemRow());
  document.getElementById("receiptHistoryButton").addEventListener("click", () => {
    renderHistory();
    historyDialog.showModal();
  });
  document.getElementById("closeReceiptHistory").addEventListener("click", () => historyDialog.close());
  historySearch.addEventListener("input", renderHistory);
  const newReceiptDialog = document.getElementById("newReceiptDialog");
  document.getElementById("newReceiptButton").addEventListener("click", showNewReceiptConfirmation);
  document.getElementById("cancelNewReceipt").addEventListener("click", () => newReceiptDialog.close());
  document.getElementById("confirmNewReceipt").addEventListener("click", () => {
    newReceiptDialog.close();
    resetForm();
  });
  document.getElementById("printButton").addEventListener("click", printReceipt);
  statusSelect.addEventListener("change", updateReceipt);
  paymentAmount.addEventListener("input", updateReceipt);

  document.querySelectorAll("#custName, #saleDate, #warrantyDate, #phoneBrand, #comments").forEach((input) => {
    input.addEventListener("input", saveData);
    input.addEventListener("change", saveData);
  });

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      printReceipt();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      showNewReceiptConfirmation();
    }
  });

  document.getElementById("saleDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("warrantyDate").value = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  addItemRow();
  loadHistory();
  renderHistory();
  loadData();
  updateReceipt();
  registerServiceWorker();
})();
