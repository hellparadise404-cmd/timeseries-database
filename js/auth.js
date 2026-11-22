// ===== Auth Helper Functions =====

// Get current logged-in user
async function getUser() {
    try {
        const { data, error } = await window.supabaseClient.auth.getSession();
        if (error) return null;
        return data.session?.user || null;
    } catch (e) {
        console.error('getUser error:', e);
        return null;
    }
}

// Redirect to login if not authenticated
async function requireAuth() {
    const user = await getUser();
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    return user;
}

// Redirect to dashboard if already logged in
async function redirectIfLoggedIn() {
    const user = await getUser();
    if (user) {
        window.location.href = 'dashboard.html';
    }
}

// Email + password login
async function loginWithEmail(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// Email + password signup
async function signupWithEmail(email, password) {
    const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

// Google OAuth login (with friendly error handling)
async function loginWithGoogle() {
    const errBox = document.getElementById('errorMsg');
    if (errBox) {
        errBox.innerHTML = '<strong>Google Login Notice:</strong> Google OAuth requires a Google Client ID in your Supabase Dashboard (under <em>Authentication → Providers → Google</em>).<br><br>Please <strong>use Email & Password</strong> below to log in or sign up immediately!';
        errBox.style.display = 'block';
    }
}

// Log out
async function logout() {
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}
