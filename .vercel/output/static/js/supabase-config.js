// Supabase project config
const SUPABASE_URL = 'https://hyzbssegcgplgkmssdgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5emJzc2VnY2dwbGdrbXNzZGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNDAyMjQsImV4cCI6MjExMDkxNjIyNH0.-B9F36tsW44gV87UYVshBypwlNc5PEKvXivnECFBRJo';

// Initialize client under unique variable to avoid collision with UMD library
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
