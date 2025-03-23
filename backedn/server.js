require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Database connection
const pool = new Pool({
    user: "myuser",
    host: "localhost",
    database: "mydb",
    password: "qwer",
    port: 5432,
});

// Validate database connection on startup
async function validateDbConnection() {
    try {
        const client = await pool.connect();
        console.log("Database connection successful");
        client.release();
        return true;
    } catch (error) {
        console.error("Database connection failed:", error.message);
        return false;
    }
}

// Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASS,
    },
});

// Store OTPs
const otps = {};

// Signup
app.post("/signup", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ status: "error", message: "Email and password are required" });
    }
    
    try {
        // Check if user already exists
        const existingUser = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                status: "error", 
                message: "User already exists", 
                action: "login" 
            });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query("INSERT INTO users (email, password) VALUES ($1, $2)", [email, hashedPassword]);
        
        // Generate and store OTP for signup verification
        const otp = Math.floor(100000 + Math.random() * 900000);
        otps[email] = otp;

        // Send OTP for verification
        try {
            await transporter.sendMail({
                from: process.env.EMAIL,
                to: email,
                subject: "Email Verification",
                text: `Your verification code is: ${otp}`,
            });
            res.json({ 
                status: "success", 
                message: "Account created! Please verify your email with the code we sent." 
            });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            res.status(500).json({ 
                status: "error", 
                message: "Failed to send verification email" 
            });
        }
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ 
            status: "error", 
            message: "Server error during registration" 
        });
    }
});

// Login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ 
            status: "error", 
            message: "Email and password are required" 
        });
    }
    
    try {
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        // User doesn't exist
        if (user.rows.length === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "User not found", 
                action: "signup" 
            });
        }

        // Password check
        const isPasswordValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                status: "error", 
                message: "Invalid password" 
            });
        }

        // Generate and store OTP
        const otp = Math.floor(100000 + Math.random() * 900000);
        otps[email] = otp;

        // Send OTP
        try {
            await transporter.sendMail({
                from: process.env.EMAIL,
                to: email,
                subject: "Your OTP Code",
                text: `Your OTP is: ${otp}`,
            });
            res.json({ 
                status: "success", 
                message: "OTP sent to email" 
            });
        } catch (emailError) {
            console.error("Email sending error:", emailError);
            res.status(500).json({ 
                status: "error", 
                message: "Failed to send OTP email" 
            });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ 
            status: "error", 
            message: "Server error during login" 
        });
    }
});

// Verify OTP
app.post("/verify-otp", async (req, res) => {
    const { email, otp, isSignUp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ 
            status: "error", 
            message: "Email and verification code are required" 
        });
    }

    if (!otps[email]) {
        return res.status(400).json({ 
            status: "error", 
            message: "Verification code expired or not requested" 
        });
    }

    if (otps[email] == otp) {
        delete otps[email]; // Remove OTP after verification
        
        if (isSignUp) {
            // For signup, we might want to update a user status field to "verified"
            try {
                await pool.query("UPDATE users SET is_verified = true WHERE email = $1", [email]);
            } catch (error) {
                console.error("Error updating verification status:", error);
                // Continue anyway since the user was created
            }
        }
        
        const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.json({ 
            status: "success", 
            message: isSignUp ? "Email verified successfully!" : "OTP verified successfully!", 
            token 
        });
    } else {
        res.status(401).json({ 
            status: "error", 
            message: "Invalid verification code" 
        });
    }
});

// Add note
app.post("/notes", async (req, res) => {
    const { token, content } = req.body;
    
    if (!token || !content) {
        return res.status(400).json({ 
            status: "error", 
            message: "Token and content are required" 
        });
    }
    
    try {
        const { email } = jwt.verify(token, process.env.JWT_SECRET);
        const user = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "User not found" 
            });
        }
        
        await pool.query("INSERT INTO notes (user_id, content) VALUES ($1, $2)", [user.rows[0].id, content]);
        res.json({ 
            status: "success", 
            message: "Note added successfully!" 
        });
    } catch (error) {
        console.error("Add note error:", error);
        res.status(401).json({ 
            status: "error", 
            message: "Unauthorized or server error" 
        });
    }
});

// Get notes
app.get("/notes", async (req, res) => {
    const token = req.headers.token;
    
    if (!token) {
        return res.status(400).json({ 
            status: "error", 
            message: "Token is required" 
        });
    }
    
    try {
        const { email } = jwt.verify(token, process.env.JWT_SECRET);
        const user = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "User not found" 
            });
        }
        
        const notes = await pool.query("SELECT id, content, created_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC", [user.rows[0].id]);
        res.json({ 
            status: "success", 
            notes: notes.rows 
        });
    } catch (error) {
        console.error("Get notes error:", error);
        res.status(401).json({ 
            status: "error", 
            message: "Unauthorized or server error" 
        });
    }
});

// Start server only if database connection is successful
async function startServer() {
    const isDbConnected = await validateDbConnection();
    
    if (isDbConnected) {
        app.listen(3000, () => console.log("Server running on port 5432"));
    } else {
        console.error("Server not started due to database connection failure");
        process.exit(1);
    }
}

startServer();