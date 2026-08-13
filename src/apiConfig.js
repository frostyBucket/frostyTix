// TODO: point this at wherever the Spring Boot backend actually runs
// (defaults to Spring Boot's default local port).
export const BACKEND_URL = "https://frostylabs-backend-650606721572.us-central1.run.app";

// TODO: fill in one of the values from your api.keys config. The backend
// rejects any request missing a valid X-API-Key header (see
// ApiKeyAuthFilter), so this has to be a real key, not a placeholder.
export const API_KEY = "6f9e2c0d9e6b4f1f9c7a";
const SESSION_KEY = "frostyTixSession";

export function apiHeaders() {
    var headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
    };
 
    var session = loadSession();
    if (session) {
        headers["Authorization"] = "Bearer " + session.token;
    }
 
    return headers;
}
 
// Stores the session token plus the stable identity fields (name/email) that
// don't need to be re-fetched on every load. Boards/invites are NOT cached
// here on purpose - those change, so they always get fetched fresh via
// /tix/me using just the token.
export function saveSession(token, user) {
    var session = {
        token: token,
        id: user.id,
        name: user.name,
        email: user.email,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
 
export function loadSession() {
    var raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
        return null;
    }
 
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}
 
export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

