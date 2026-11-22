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

// Google OAuth login
async function loginWithGoogle() {
    const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/dashboard.html') }
    });
    if (error) throw error;
    return data;
}

// Log out
async function logout() {
    await window.supabaseClient.auth.signOut();
    window.location.href = 'index.html';
}
