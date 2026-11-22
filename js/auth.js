// ===== Auth Helper Functions =====

// Get current logged-in user
async function getUser() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user || null;
}

// Redirect to login if not authenticated
async function requireAuth() {
    const user = await getUser();
    if (!user) window.location.href = 'index.html';
    return user;
}

// Redirect to dashboard if already logged in
async function redirectIfLoggedIn() {
    const user = await getUser();
    if (user) window.location.href = 'dashboard.html';
}

// Email + password login
async function loginWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

// Email + password signup
async function signupWithEmail(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

// Google OAuth login
async function loginWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard.html' }
    });
    if (error) throw error;
    return data;
}

// Log out
async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}
