// ======================================
// BLACK.HOTSPOT - ADMIN DASHBOARD
// ======================================

const customerForm = document.getElementById("customerForm");
const customerTable = document.getElementById("customerTable");
const searchCustomer = document.getElementById("searchCustomer");
const formMessage = document.getElementById("formMessage");

const totalCustomers = document.getElementById("totalCustomers");
const activeCustomers = document.getElementById("activeCustomers");
const totalRevenue = document.getElementById("totalRevenue");
const expiredCustomers = document.getElementById("expiredCustomers");

// Temporary records for development.
// These are not yet connected to a secure database.

let customers = JSON.parse(
    localStorage.getItem("blackHotspotCustomers") || "[]"
);

function updateDashboard() {
    localStorage.setItem(
        "blackHotspotCustomers",
        JSON.stringify(customers)
    );

    totalCustomers.textContent = customers.length;

    // Keep the rest of your existing function here.

    activeCustomers.textContent = customers.filter(
        customer => customer.status === "Active"
    ).length;

    expiredCustomers.textContent = customers.filter(
        customer => customer.status === "Expired"
    ).length;

    const revenue = customers.reduce(
        (total, customer) => total + customer.amount,
        0
    );

    totalRevenue.textContent = `KSh ${revenue.toLocaleString()}`;
}

function displayCustomers() {
    const searchTerm = searchCustomer.value.trim().toLowerCase();

    const filteredCustomers = customers.filter(customer =>
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.phone.includes(searchTerm)
    );

    customerTable.innerHTML = "";

    if (filteredCustomers.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 6;
        cell.textContent = customers.length === 0
            ? "No customers registered yet."
            : "No matching customers found.";

        row.appendChild(cell);
        customerTable.appendChild(row);
        return;
    }

    filteredCustomers.forEach(customer => {
        const row = document.createElement("tr");

        const values = [
            customer.name,
            customer.phone,
            customer.packageName,
            `KSh ${customer.amount}`,
            customer.status
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const actionCell = document.createElement("td");
        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            customers = customers.filter(
                item => item.id !== customer.id
            );

            displayCustomers();
            updateDashboard();

            formMessage.textContent =
                "Customer removed from this temporary list.";
        });

        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);

        customerTable.appendChild(row);
    });
}

customerForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const name = document
        .getElementById("customerName")
        .value.trim();

    const phone = document
        .getElementById("customerPhone")
        .value.trim();

    const packageSelect = document.getElementById("customerPackage");

    const amount = Number(packageSelect.value);

    const packageName =
        packageSelect.options[packageSelect.selectedIndex].text;

    if (!/^07\d{8}$/.test(phone)) {
        formMessage.textContent =
            "Enter a valid Kenyan phone number, e.g. 0712345678.";
        return;
    }

    const duplicate = customers.some(
        customer => customer.phone === phone
    );

    if (duplicate) {
        formMessage.textContent =
            "This phone number is already registered.";
        return;
    }

    customers.push({
        id: Date.now() + Math.random(),
        name,
        phone,
        packageName,
        amount,
        status: "Active"
    });

    customerForm.reset();

    formMessage.textContent =
        "Customer added to the temporary dashboard list.";

    displayCustomers();
    updateDashboard();
});

searchCustomer.addEventListener("input", displayCustomers);

// Initial dashboard
displayCustomers();
updateDashboard();

console.log("Black.Hotspot admin dashboard is ready.");