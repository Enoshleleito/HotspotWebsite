const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

// Daraja Sandbox credentials
const CONSUMER_KEY = "ul8klNHGfrunQxE9AXBsDdC9fiG0pzB52ItJaPO6rK2hwdWc";
const CONSUMER_SECRET = "K4SAJTErUxlSOuFu4rpmbTKcZTpLrsZvazA4m9XHBlml1J4ifzIJi2raIXvrxpvb";
const SHORTCODE = "174379";
const PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

// Ngrok callback URL
const CALLBACK_URL =
    "https://velocity-stable-linseed.ngrok-free.dev/callback";

// Temporary payment storage
const paymentStatuses = new Map();


// Generate Kenya timestamp: YYYYMMDDHHmmss
function getTimestamp() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);

    const values = {};

    for (const part of parts) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    }

    return (
        values.year +
        values.month +
        values.day +
        values.hour +
        values.minute +
        values.second
    );
}


// Get Daraja access token
async function getAccessToken() {
    const auth = Buffer.from(
        `${CONSUMER_KEY}:${CONSUMER_SECRET}`
    ).toString("base64");

    const response = await axios.get(
        "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        {
            headers: {
                Authorization: `Basic ${auth}`
            }
        }
    );

    if (!response.data.access_token) {
        throw new Error("Daraja did not return an access token.");
    }

    return response.data.access_token;
}


// Home route
app.get("/", (req, res) => {
    res.send("Black.Hotspot M-Pesa backend is running!");
});


// Test access token
app.get("/mpesa-token", async (req, res) => {
    try {
        const accessToken = await getAccessToken();

        res.json({
            success: true,
            message: "Access token obtained successfully."
        });
    } catch (error) {
        console.error(
            "TOKEN ERROR:",
            error.response?.data || error.message
        );

        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});


// STK Push
app.post("/stkpush", async (req, res) => {
    try {
        const phoneInput =
            req.body.phone ||
            req.body.phoneNumber ||
            req.body.PhoneNumber;

        const amount = Number(req.body.amount);

        if (!phoneInput || !Number.isFinite(amount) || amount < 1) {
            return res.status(400).json({
                success: false,
                message: "Valid phone number and amount are required."
            });
        }

        const inputPhone = String(phoneInput).trim();

        let phone;

        if (/^07\d{8}$/.test(inputPhone)) {
            phone = "254" + inputPhone.substring(1);
        } else if (/^2547\d{8}$/.test(inputPhone)) {
            phone = inputPhone;
        } else {
            return res.status(400).json({
                success: false,
                message: "Enter a valid phone number."
            });
        }

        const accessToken = await getAccessToken();

        const timestamp = getTimestamp();

        const password = Buffer.from(
            SHORTCODE + PASSKEY + timestamp
        ).toString("base64");

        const payload = {
            BusinessShortCode: SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: CALLBACK_URL,
            AccountReference: "Black.Hotspot",
            TransactionDesc: "Hotspot Payment"
        };

        console.log("STK PUSH: Sending request");
        console.log("Phone:", phone);
        console.log("Amount:", amount);

        const response = await axios.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("STK RESPONSE:", response.data);

        const data = response.data;

        if (data.CheckoutRequestID) {
            paymentStatuses.set(data.CheckoutRequestID, {
                status: "pending",
                checkoutRequestID: data.CheckoutRequestID,
                merchantRequestID: data.MerchantRequestID,
                phone: phone,
                amount: amount
            });
        }

        res.json(data);

    } catch (error) {
        console.error(
            "STK ERROR:",
            error.response?.data || error.message
        );

        res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});


// M-Pesa callback
app.post("/callback", (req, res) => {
    try {
        console.log(
            "MPESA CALLBACK:",
            JSON.stringify(req.body, null, 2)
        );

        const callback = req.body?.Body?.stkCallback;

        if (!callback) {
            return res.status(400).json({
                ResultCode: 1,
                ResultDesc: "Invalid callback data"
            });
        }

        const checkoutID = callback.CheckoutRequestID;
        const resultCode = Number(callback.ResultCode);

        const payment = paymentStatuses.get(checkoutID) || {};

        payment.checkoutRequestID = checkoutID;
        payment.merchantRequestID = callback.MerchantRequestID;
        payment.status = resultCode === 0 ? "success" : "failed";
        payment.resultCode = resultCode;
        payment.resultDescription = callback.ResultDesc;

        if (resultCode === 0) {
            const items =
                callback.CallbackMetadata?.Item || [];

            for (const item of items) {
                if (item.Name === "MpesaReceiptNumber") {
                    payment.receiptNumber = item.Value;
                }

                if (item.Name === "Amount") {
                    payment.paidAmount = item.Value;
                }

                if (item.Name === "PhoneNumber") {
                    payment.paidPhone = item.Value;
                }
            }
        }

        paymentStatuses.set(checkoutID, payment);

        console.log("PAYMENT STATUS:", payment.status);

        res.json({
            ResultCode: 0,
            ResultDesc: "Accepted"
        });

    } catch (error) {
        console.error("CALLBACK ERROR:", error.message);

        res.status(500).json({
            ResultCode: 1,
            ResultDesc: "Callback processing failed"
        });
    }
});


// Check payment status
app.get("/payment-status/:checkoutID", (req, res) => {
    const checkoutID = req.params.checkoutID;

    const payment = paymentStatuses.get(checkoutID);

    if (!payment) {
        return res.status(404).json({
            status: "unknown",
            message: "Payment not found"
        });
    }

    res.json(payment);
});


// Start server
app.listen(PORT, () => {
    console.log(
        `Black.Hotspot M-Pesa backend is running on port ${PORT}`
    );
});