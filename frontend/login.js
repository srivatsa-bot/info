let token = "";
let isSignUp = false;
let isLoading = false;
let pendingEmail = ""; // Store email during signup process

// Toggle between login and signup
function toggleAuth() {
    isSignUp = !isSignUp;
    document.getElementById("auth-title").innerText = isSignUp ? "Sign Up" : "Sign In";
    document.getElementById("auth-button").innerText = isSignUp ? "Register" : "Login";
    document.getElementById("toggle-auth").innerHTML = isSignUp
        ? 'Already have an account? <a href="#" class="link" onclick="toggleAuth()">Sign In</a>'
        : 'Don\'t have an account? <a href="#" class="link" onclick="toggleAuth()">Sign Up</a>';
}

// Handle authentication (login/signup)
async function authenticate() {
    if (isLoading) return;
    
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    
    if (!email || !password) {
        showMessage("Please enter both email and password", "error");
        return;
    }

    // Show loading state
    setLoading(true, "auth-button");
    const endpoint = isSignUp ? "signup" : "login";
    
    try {
        const res = await fetch(`http://localhost:3000/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        setLoading(false, "auth-button");
        
        if (data.status === "error") {
            // Handle case where user tries to login but needs to signup
            if (data.action === "signup") {
                showMessage("User not found. Please sign up first.", "error");
                toggleAuth(); // Switch to signup mode
                return;
            }
            
            // Handle case where user tries to signup but should login
            if (data.action === "login") {
                showMessage("User already exists. Please login instead.", "error");
                toggleAuth(); // Switch to login mode
                return;
            }
            
            showMessage(data.message, "error");
            return;
        }

        showMessage(data.message, "success");
        pendingEmail = email; // Store email for OTP verification
        
        // Whether signup or login, show OTP container
        document.getElementById("auth-container").style.display = "none";
        document.getElementById("otp-container").style.display = "block";
        
        // Update OTP message based on whether it's signup or login
        const otpMessageElement = document.querySelector("#otp-container p");
        otpMessageElement.textContent = isSignUp 
            ? "A verification code has been sent to your email to complete registration." 
            : "A one-time password has been sent to your email.";
            
        // Focus the OTP input for better UX
        setTimeout(() => document.getElementById("otp").focus(), 100);
    } catch (error) {
        setLoading(false, "auth-button");
        console.error("Authentication error:", error);
        showMessage("Server connection error. Please try again later.", "error");
    }
}

// Verify OTP
async function verifyOtp() {
    if (isLoading) return;
    
    const otp = document.getElementById("otp").value;
    
    if (!otp) {
        showMessage("Please enter verification code", "error");
        return;
    }

    setLoading(true, document.querySelector("#otp-container button"));
    
    try {
        const res = await fetch("http://localhost:3000/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: pendingEmail, otp, isSignUp }),
        });

        const data = await res.json();
        setLoading(false, document.querySelector("#otp-container button"));
        
        if (data.status === "error") {
            showMessage(data.message, "error");
            return;
        }
        
        token = data.token;
        // Save token to session storage for persistence
        sessionStorage.setItem("token", token);
        
        const successMessage = isSignUp 
            ? "Account verified and created successfully!" 
            : "Login successful!";
        showMessage(successMessage, "success");
        
        if (token) {
            document.getElementById("otp-container").style.display = "none";
            document.getElementById("notes-container").style.display = "block";
            // Clear OTP field for security
            document.getElementById("otp").value = "";
            // Reset signup flag after successful registration
            isSignUp = false;
            loadNotes();
        }
    } catch (error) {
        setLoading(false, document.querySelector("#otp-container button"));
        console.error("OTP verification error:", error);
        showMessage("Server connection error. Please try again later.", "error");
    }
}

// Add new note
async function addNote() {
    if (isLoading) return;
    
    const content = document.getElementById("note").value;
    
    if (!content) {
        showMessage("Please enter note content", "error");
        return;
    }
    
    if (!token) {
        showMessage("You are not authenticated. Please login again.", "error");
        resetToLogin();
        return;
    }

    const addButton = document.querySelector("#notes-container button:not(.logout-btn)");
    setLoading(true, addButton);
    
    try {
        const res = await fetch("http://localhost:3000/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, content }),
        });
        
        const data = await res.json();
        setLoading(false, addButton);
        
        if (data.status === "error") {
            if (data.message.includes("Unauthorized")) {
                showMessage("Session expired. Please login again.", "error");
                resetToLogin();
                return;
            }
            
            showMessage(data.message, "error");
            return;
        }
        
        document.getElementById("note").value = ""; // Clear input field
        showMessage("Note added successfully!", "success");
        loadNotes();
    } catch (error) {
        setLoading(false, addButton);
        console.error("Add note error:", error);
        showMessage("Server connection error. Please try again later.", "error");
    }
}

// Load notes from server
async function loadNotes() {
    if (!token) {
        showMessage("You are not authenticated. Please login again.", "error");
        resetToLogin();
        return;
    }
    
    const notesContainer = document.getElementById("notes");
    notesContainer.innerHTML = '<div class="empty-notes">Loading notes...</div>';
    
    try {
        const res = await fetch("http://localhost:3000/notes", { 
            headers: { token } 
        });
        
        const data = await res.json();
        
        if (data.status === "error") {
            if (data.message.includes("Unauthorized")) {
                showMessage("Session expired. Please login again.", "error");
                resetToLogin();
                return;
            }
            
            showMessage(data.message, "error");
            notesContainer.innerHTML = '';
            return;
        }
        
        if (!data.notes || data.notes.length === 0) {
            notesContainer.innerHTML = '<div class="empty-notes">No notes found. Add your first note!</div>';
            return;
        }
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        data.notes.forEach(note => {
            const noteEl = document.createElement('div');
            noteEl.className = 'note-item';
            
            const content = document.createElement('p');
            content.textContent = note.content;
            
            const timestamp = document.createElement('small');
            timestamp.textContent = new Date(note.created_at).toLocaleString();
            
            noteEl.appendChild(content);
            noteEl.appendChild(timestamp);
            fragment.appendChild(noteEl);
        });
        
        notesContainer.innerHTML = '';
        notesContainer.appendChild(fragment);
    } catch (error) {
        console.error("Load notes error:", error);
        showMessage("Server connection error. Please try again later.", "error");
        notesContainer.innerHTML = '';
    }
}

// Reset to login screen
function resetToLogin() {
    token = "";
    pendingEmail = "";
    sessionStorage.removeItem("token");
    document.getElementById("notes-container").style.display = "none";
    document.getElementById("otp-container").style.display = "none";
    document.getElementById("auth-container").style.display = "block";
    isSignUp = false;
    document.getElementById("auth-title").innerText = "Sign In";
    document.getElementById("auth-button").innerText = "Login";
    document.getElementById("toggle-auth").innerHTML = 'Don\'t have an account? <a href="#" class="link" onclick="toggleAuth()">Sign Up</a>';
    
    // Clear form fields for security
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("otp").value = "";
}

// New logout function
function logout() {
    showMessage("Logged out successfully!", "success");
    resetToLogin();
}

// Show message with type
function showMessage(message, type = "info") {
    // Remove existing message if present
    const existingMessage = document.getElementById("message");
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageElement = document.createElement("div");
    messageElement.id = "message";
    messageElement.textContent = message;
    
    // Set color based on message type
    if (type === "error") {
        messageElement.style.backgroundColor = "#f44336";
    } else if (type === "success") {
        messageElement.style.backgroundColor = "#4caf50";
    } else {
        messageElement.style.backgroundColor = "#2196f3";
    }
    
    document.body.appendChild(messageElement);
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.remove();
        }
    }, 4000);
}

// Set loading state on buttons
function setLoading(isLoadingState, buttonElement) {
    isLoading = isLoadingState;
    
    if (typeof buttonElement === 'string') {
        buttonElement = document.getElementById(buttonElement);
    }
    
    if (!buttonElement) return;
    
    const originalText = buttonElement.textContent;
    
    if (isLoadingState) {
        buttonElement.disabled = true;
        const loadingSpan = document.createElement('span');
        loadingSpan.className = 'loading';
        buttonElement.textContent = 'Processing ';
        buttonElement.appendChild(loadingSpan);
    } else {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
    }
}

// Add event listeners for form submission
document.addEventListener("DOMContentLoaded", function() {
    // Handle form submission with Enter key
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const container = this.closest('div[id$="-container"]');
                
                if (container.id === 'auth-container') {
                    authenticate();
                } else if (container.id === 'otp-container') {
                    verifyOtp();
                } else if (container.id === 'notes-container' && this.id === 'note') {
                    addNote();
                }
            }
        });
    });
    
    // Check for saved token in session storage
    const savedToken = sessionStorage.getItem("token");
    if (savedToken) {
        token = savedToken;
        document.getElementById("auth-container").style.display = "none";
        document.getElementById("notes-container").style.display = "block";
        loadNotes();
    }
});