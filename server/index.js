const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const formData = require("form-data");
const Mailgun = require("mailgun.js");


dotenv.config();

const app = express();
const PORT = 3000;

// ========================================
// Supabase
// ========================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: WebSocket
    }
  }
);


// ========================================
// Mailgun
// ========================================

const mailgun = new Mailgun(formData);

const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY
});


// ========================================
// Middleware
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// ORDER CONFIRMATION EMAIL
// ========================================

async function sendOrderConfirmationEmail({
  email,
  order
}) {
  try {
    await mg.messages.create(
      process.env.MAILGUN_DOMAIN,
      {
        from: process.env.MAILGUN_FROM,
        to: [email],
        subject: `TechVerse Gear Order Confirmation`,
        text: `
Thank you for your order!

Your TechVerse Gear order has been successfully confirmed.

Order ID: ${order.id}
Total: NGN ${Number(order.total).toFixed(2)}
Status: ${order.status}

Thank you for shopping with TechVerse Gear.
        `.trim()
      }
    );

    console.log(
      `Order confirmation email sent to ${email}`
    );

  } catch (error) {
    console.error(
      "Mailgun email error:",
      error
    );
  }
}

// ========================================
// GET /api/products
// ========================================

app.get("/api/products", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error:", error);

      return res.status(500).json({
        error: "Failed to fetch products"
      });
    }

    res.json(data);

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// --- Paystack Payment Initialization ---
app.post("/api/payments/initialize", async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      street,
      city,
      state,
      postalCode,
      items
    } = req.body;

    // -----------------------------
    // 1. Validate customer details
    // -----------------------------
    if (
      !email ||
      !firstName ||
      !lastName ||
      !street ||
      !city ||
      !state ||
      !postalCode ||
      !items?.length
    ) {
      return res.status(400).json({
        error: "Missing required payment information"
      });
    }

    // -----------------------------
    // 2. Validate cart item IDs
    // -----------------------------
    for (const item of items) {
      if (!item.id || !item.quantity) {
        return res.status(400).json({
          error: "Invalid cart item"
        });
      }

      if (
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0
      ) {
        return res.status(400).json({
          error: "Invalid product quantity"
        });
      }
    }

    // -----------------------------
    // 3. Get authoritative products
    // -----------------------------
    const productIds = items.map(item => item.id);

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, stock")
      .in("id", productIds);

    if (productsError) {
      console.error(
        "Payment product lookup error:",
        productsError
      );

      return res.status(500).json({
        error: "Failed to validate products"
      });
    }

    if (!products || products.length !== productIds.length) {
      return res.status(400).json({
        error: "One or more products could not be found"
      });
    }

    // -----------------------------
    // 4. Calculate total on server
    // -----------------------------
    let subtotal = 0;

    const validatedItems = [];

    for (const item of items) {
      const product = products.find(
        p => p.id === item.id
      );

      if (!product) {
        return res.status(400).json({
          error: "Product not found"
        });
      }

      const quantity = Number(item.quantity);

      if (quantity > product.stock) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}. Only ${product.stock} available.`
        });
      }

      const itemTotal =
        Number(product.price) * quantity;

      subtotal += itemTotal;

      validatedItems.push({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity
      });
    }

    // -----------------------------
    // 5. Calculate tax
    // -----------------------------
    const tax = subtotal * 0.085;

    const total = subtotal + tax;

    // -----------------------------
    // 6. Convert NGN to kobo
    // -----------------------------
    const amountInKobo = Math.round(
      total * 100
    );

    // -----------------------------
    // 7. Generate unique reference
    // -----------------------------
    const reference =
      `TVG-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

    // -----------------------------
    // 8. Save pending payment
    // -----------------------------
    const shippingAddress = {
      firstName,
      lastName,
      street,
      city,
      state,
      postalCode
    };

    const { error: intentError } = await supabase
      .from("payment_intents")
      .insert({
        reference,
        user_email: email,
        amount: total,
        currency: "NGN",
        shipping_address: shippingAddress,
        items: validatedItems,
        status: "pending"
      });

    if (intentError) {
      console.error(
        "Payment intent creation error:",
        intentError
      );

      return res.status(500).json({
        error: "Failed to create payment session"
      });
    }

    // -----------------------------
    // 9. Initialize Paystack
    // -----------------------------
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,

          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          email,
          amount: amountInKobo.toString(),
          currency: "NGN",
          reference,

          callback_url:
            "http://localhost:3000/?payment=success",

          metadata: JSON.stringify({
            payment_reference: reference,
            customer_email: email
          })
        })
      }
    );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      console.error(
        "Paystack initialization error:",
        paystackData
      );

      await supabase
        .from("payment_intents")
        .update({
          status: "initialization_failed"
        })
        .eq("reference", reference);

      return res.status(502).json({
        error:
          paystackData.message ||
          "Failed to initialize Paystack payment"
      });
    }

    // -----------------------------
    // 10. Return checkout URL
    // -----------------------------
    res.status(200).json({
      message: "Payment initialized successfully",

      payment: {
        reference:
          paystackData.data.reference,

        authorizationUrl:
          paystackData.data.authorization_url,

        amount: total,

        currency: "NGN"
      }
    });

  } catch (error) {
    console.error(
      "Payment initialization server error:",
      error
    );

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// --- Paystack Payment Verification ---
app.get("/api/payments/verify", async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({
        error: "Payment reference is required"
      });
    }

    /*
      1. Find our payment intent.
    */
    const { data: paymentIntent, error: intentError } =
      await supabase
        .from("payment_intents")
        .select("*")
        .eq("reference", reference)
        .single();

    if (intentError || !paymentIntent) {
      console.error(
        "Payment intent lookup error:",
        intentError
      );

      return res.status(404).json({
        error: "Payment reference not found"
      });
    }

    /*
      2. If already completed, don't create another order.
    */
    if (
      paymentIntent.status === "completed" &&
      paymentIntent.order_id
    ) {
      return res.status(200).json({
        message: "Payment already verified",
        payment: {
          reference: paymentIntent.reference,
          status: "completed"
        },
        order: {
          id: paymentIntent.order_id
        }
      });
    }

    /*
      3. Ask Paystack for the authoritative transaction status.
    */
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const paystackData =
      await paystackResponse.json();

    if (
      !paystackResponse.ok ||
      !paystackData.status
    ) {
      console.error(
        "Paystack verification error:",
        paystackData
      );

      return res.status(502).json({
        error:
          paystackData.message ||
          "Failed to verify payment with Paystack"
      });
    }

    const transaction =
      paystackData.data;

    /*
      4. Verify the transaction is actually successful.
    */
    if (transaction.status !== "success") {

      await supabase
        .from("payment_intents")
        .update({
          status: transaction.status || "failed"
        })
        .eq("reference", reference)
        .eq("status", "pending");

      return res.status(400).json({
        error: "Payment was not successful",
        status: transaction.status
      });
    }

    /*
      5. Verify currency.
    */
    if (transaction.currency !== "NGN") {
      return res.status(400).json({
        error: "Payment currency mismatch"
      });
    }

    /*
      6. Verify the amount.

      Paystack returns amount in kobo.
      Our payment intent stores the amount in naira.
    */
    const expectedAmountInKobo =
      Math.round(
        Number(paymentIntent.amount) * 100
      );

    const paidAmountInKobo =
      Number(transaction.amount);

    if (
      !Number.isInteger(paidAmountInKobo) ||
      paidAmountInKobo !== expectedAmountInKobo
    ) {
      console.error(
        "Payment amount mismatch:",
        {
          reference,
          expectedAmountInKobo,
          paidAmountInKobo
        }
      );

      return res.status(400).json({
        error: "Payment amount mismatch"
      });
    }

    /*
      7. Finalize the payment.

      This database function:
      - locks the payment intent
      - creates the order
      - deducts stock
      - creates order items
      - marks payment intent completed
    */
    const { data: finalizedPayment, error: finalizeError } =
      await supabase.rpc(
        "finalize_payment_intent",
        {
          p_reference: reference
        }
      );

    if (finalizeError) {
      console.error(
        "Payment finalization error:",
        finalizeError
      );

      return res.status(500).json({
        error:
          finalizeError.message ||
          "Payment was successful but order creation failed"
      });
    }

    await sendOrderConfirmationEmail({
      email: paymentIntent.user_email,
      order: finalizedPayment.order
    }); 
    return res.status(200).json({
      message: "Payment verified and order created",
      payment: {
        reference,
        status: "completed"
      },
      order:
        finalizedPayment.order || {
          id: finalizedPayment.orderId
        }
    });

  } catch (error) {
    console.error(
      "Payment verification server error:",
      error
    );

    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

// ========================================
// POST /api/orders
// ========================================

app.post("/api/orders", async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      street,
      city,
      state,
      postalCode,
      paymentMethod,
      items
    } = req.body;

    // ========================================
    // Validate required order information
    // ========================================

    if (
      !email ||
      !firstName ||
      !lastName ||
      !street ||
      !city ||
      !state ||
      !postalCode ||
      !items?.length
    ) {
      return res.status(400).json({
        error: "Missing required order information"
      });
    }

    // ========================================
    // Validate that each cart item has an ID
    // and a quantity
    // ========================================

    for (const item of items) {
      if (!item.id || !item.quantity) {
        return res.status(400).json({
          error: "Invalid cart item"
        });
      }
    }

    // ========================================
    // Prepare only trusted cart data
    // ========================================
    // We deliberately do NOT send title or price
    // from the frontend to the database function.
    // The database retrieves those values itself.
    // ========================================

    const orderItems = items.map(item => ({
      id: item.id,
      quantity: Number(item.quantity)
    }));

    // ========================================
    // Create order atomically
    // ========================================

    const { data: order, error: orderError } = await supabase
      .rpc("create_order_atomic", {
        p_email: email,
        p_first_name: firstName,
        p_last_name: lastName,
        p_street: street,
        p_city: city,
        p_state: state,
        p_postal_code: postalCode,
        p_payment_method: paymentMethod || "Card",
        p_items: orderItems
      });

    if (orderError) {
      console.error("Order creation error:", orderError);

      // Stock-related errors
      if (
        orderError.message?.includes("Insufficient stock")
      ) {
        return res.status(400).json({
          error: orderError.message
        });
      }

      // Product-related errors
      if (
        orderError.message?.includes("Product not found")
      ) {
        return res.status(400).json({
          error: orderError.message
        });
      }

      // Quantity-related errors
      if (
        orderError.message?.includes("Invalid product quantity")
      ) {
        return res.status(400).json({
          error: orderError.message
        });
      }

      return res.status(500).json({
        error: "Failed to create order"
      });
    }

    // ========================================
    // Successful response
    // ========================================

    res.status(201).json({
      message: "Order created successfully",
      order
    });

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// ========================================
// GET /api/orders
// ========================================

app.get("/api/orders", async (req, res) => {
  try {
    const { email } = req.query;

    // ----------------------------------------
    // Validate email
    // ----------------------------------------

    if (!email) {
      return res.status(400).json({
        error: "Email is required"
      });
    }

    // ----------------------------------------
    // Get user's orders
    // ----------------------------------------

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (ordersError) {
      console.error("Orders fetch error:", ordersError);

      return res.status(500).json({
        error: "Failed to fetch orders"
      });
    }

    // ----------------------------------------
    // Get order IDs
    // ----------------------------------------

    const orderIds = orders.map(order => order.id);

    let orderItems = [];

    // ----------------------------------------
    // Fetch order items
    // ----------------------------------------

    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);

      if (itemsError) {
        console.error("Order items fetch error:", itemsError);

        return res.status(500).json({
          error: "Failed to fetch order items"
        });
      }

      orderItems = items || [];
    }

    // ----------------------------------------
    // Format orders for frontend
    // ----------------------------------------

    const formattedOrders = orders.map(order => ({
      id: order.id,
      email: order.user_email,
      total: Number(order.total_amount),
      status: order.status,

      date: order.created_at
        ? order.created_at.split("T")[0]
        : null,

      shippingAddress: order.shipping_address,

      paymentMethod: order.payment_method,

      items: orderItems
        .filter(item => item.order_id === order.id)
        .map(item => ({
          title: item.product_name,
          quantity: item.quantity,
          price: Number(item.price)
        }))
    }));

    res.json(formattedOrders);

  } catch (error) {
    console.error("Server error:", error);

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// ========================================
// Serve Frontend
// ========================================

app.use(
  express.static(path.join(__dirname, "../public"))
);

// ========================================
// Start Server
// ========================================

app.listen(PORT, () => {
  console.log(
    `TechVerse Gear server running on http://localhost:${PORT}`
  );
});