import './index.css';
import { BACKEND_URL, apiHeaders, saveSession, loadSession, clearSession } from './apiConfig.js';

document.addEventListener("DOMContentLoaded", () => {
    const loginButton = document.getElementById("login-button");
    const welcomeMessage = document.getElementById("welcome-message");

    // TODO: replace with your own OAuth client ID from Google Cloud Console
    // (Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID -> Web application)
    const GOOGLE_CLIENT_ID = "650606721572-pir71jo2d2hm7o9hu516dverqon8hsah.apps.googleusercontent.com";

    const boardsList = document.getElementById("boards-list");
    const invitesList = document.getElementById("invites-list");

    // Mirrors the cached session (id/name/email/token) once logged in - null
    // means logged out.
    var currentUser = null;

    // Using the OAuth token-client flow here instead of the ID token / One Tap
    // flow. One Tap's underlying FedCM mechanism has a known, unresolved bug
    // where it fails on localhost even when correctly configured (works fine
    // on deployed HTTPS domains). This flow only asks for basic profile/email
    // scope - we just need name + email for display, nothing else.
    var tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "profile email",
        callback: (tokenResponse) => {
            handleLoginSuccess(tokenResponse);
        },
    });

    function handleLoginSuccess(tokenResponse) {
        fetch(BACKEND_URL + "/tix/login", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ accessToken: tokenResponse.access_token }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Login request failed with status " + res.status);
            }
            return res.json();
        })
        .then((loginResponse) => {
            saveSession(loginResponse.token, loginResponse.user);
            enterLoggedInState(loginResponse.user);
        })
        .catch((err) => {
            console.error("Login failed:", err);
            welcomeMessage.textContent = "Login failed - please try again";
        });
    }

    function enterLoggedInState(user) {
        currentUser = user;

        welcomeMessage.textContent = "Welcome, " + user.name;
        loginButton.textContent = "Log out";

        fetchAndRenderBoards();
        fetchAndRenderInvites();
    }

    function enterLoggedOutState() {
        currentUser = null;
        clearSession();

        welcomeMessage.textContent = "Welcome";
        loginButton.textContent = "Login with Google";

        renderBoards([]);
        renderInvites([]);
        graphPlaceholderText.textContent = "Graph goes here";
    }

    // On launch, restore a saved session instead of making the user log in
    // again every time. Name/email come straight from the cache; boards and
    // invites get refreshed live since those actually change over time.
    function restoreSessionIfPresent() {
        var session = loadSession();
        if (!session) {
            return;
        }

        welcomeMessage.textContent = "Welcome, " + session.name;
        loginButton.textContent = "Log out";
        currentUser = session;

        fetch(BACKEND_URL + "/tix/me", {
            method: "GET",
            headers: apiHeaders(),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Session refresh failed with status " + res.status);
            }
            return res.json();
        })
        .then((user) => {
            currentUser = Object.assign({ token: session.token }, user);
            fetchAndRenderBoards();
            fetchAndRenderInvites();
        })
        .catch((err) => {
            // Token expired, was revoked, or the backend is unreachable -
            // fall back to a clean logged-out state rather than pretending
            // to be logged in with stale data.
            console.error("Couldn't restore session:", err);
            enterLoggedOutState();
        });
    }

    function clearEmptyBoardsState() {
        var emptyState = boardsList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
    }

    function addBoardListItem(board) {
        clearEmptyBoardsState();

        var item = document.createElement('li');
        item.classList.add('board-item');

        var titleSpan = document.createElement('span');
        titleSpan.classList.add('board-item-title');
        titleSpan.textContent = board.title;

        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.classList.add('board-delete-icon');
        deleteButton.title = 'Delete board';
        deleteButton.setAttribute('aria-label', 'Delete board');
        deleteButton.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">' +
            '<path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm2 5h2v9h-2V8zm-4 0h2v9H7V8zm8 0h2v9h-2V8z"/>' +
            '</svg>';

        item.appendChild(titleSpan);
        item.appendChild(deleteButton);

        item.addEventListener('click', () => {
            var url = "tickets.html?boardId=" + encodeURIComponent(board.id);
            if (board.title) {
                url += "&title=" + encodeURIComponent(board.title);
            }
            if (board.code) {
                url += "&code=" + encodeURIComponent(board.code);
            }
            window.location.href = url;
        });

        deleteButton.addEventListener('click', (e) => {
            // Don't let this bubble up to the row's click handler, which
            // would otherwise navigate into the board we're deleting.
            e.stopPropagation();

            fetch(BACKEND_URL + "/tix/delete-board/" + board.id, {
                method: "DELETE",
                headers: apiHeaders(),
            })
            .then((res) => {
                if (!res.ok) {
                    throw new Error("Failed to delete board, status " + res.status);
                }
                item.remove();
                if (boardsList.children.length === 0) {
                    renderBoards([]);
                }
            })
            .catch((err) => {
                console.error("Failed to delete board:", err);
            });
        });

        boardsList.appendChild(item);
    }

    function renderBoards(boards) {
        boardsList.innerHTML = '';
        populateBoardRatioSelect(boards);

        if (!boards || boards.length === 0) {
            var emptyItem = document.createElement('li');
            emptyItem.classList.add('empty-state');
            emptyItem.textContent = "No boards yet — create one to get started!";
            boardsList.appendChild(emptyItem);
            return;
        }

        boards.forEach((board) => {
            addBoardListItem(board);
        });
    }

    // ----- Board progress dropdown (fills the space where a real graph -----
    // ----- will eventually go) -----

    const boardRatioSelect = document.getElementById("board-ratio-select");
    const graphPlaceholderText = document.getElementById("graph-placeholder-text");

    function isCompleted(ticket) {
        var normalized = (ticket.completion || "").toLowerCase();
        return normalized.indexOf("complet") !== -1 || normalized === "done";
    }

    function populateBoardRatioSelect(boards) {
        var previousValue = boardRatioSelect.value;
        boardRatioSelect.innerHTML = '';

        var placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'View board progress...';
        boardRatioSelect.appendChild(placeholderOption);

        (boards || []).forEach((board) => {
            var option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.title;
            boardRatioSelect.appendChild(option);
        });

        // Keep the current selection across a refresh, as long as that
        // board still exists in the new list.
        var stillExists = Array.from(boardRatioSelect.options).some((opt) => opt.value === previousValue);
        boardRatioSelect.value = stillExists ? previousValue : '';
    }

    boardRatioSelect.addEventListener("change", () => {
        var boardId = boardRatioSelect.value;

        if (!boardId) {
            graphPlaceholderText.textContent = "Graph goes here";
            return;
        }

        fetch(BACKEND_URL + "/tix/get-tix", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ id: Number(boardId) }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to load board progress, status " + res.status);
            }
            return res.json();
        })
        .then((tickets) => {
            var completedCount = tickets.filter(isCompleted).length;
            graphPlaceholderText.textContent = completedCount + " / " + tickets.length + " tickets completed";
        })
        .catch((err) => {
            console.error("Failed to load board progress:", err);
            graphPlaceholderText.textContent = "Couldn't load progress";
        });
    });

    // The actual "what boards does this user have" call - queries the
    // backend directly instead of relying on stale data cached on the user.
    function fetchAndRenderBoards() {
        fetch(BACKEND_URL + "/tix/my-boards", {
            method: "GET",
            headers: apiHeaders(),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to load boards, status " + res.status);
            }
            return res.json();
        })
        .then((boards) => {
            renderBoards(boards);
        })
        .catch((err) => {
            console.error("Failed to load boards:", err);
            renderBoards([]);
        });
    }

    function renderInvites(boards) {
        invitesList.innerHTML = '';

        if (!boards || boards.length === 0) {
            return;
        }

        boards.forEach((board) => {
            var item = document.createElement('li');
            item.textContent = board.title;
            item.addEventListener('click', () => {
                openInvitePopup(board);
            });
            invitesList.appendChild(item);
        });
    }

    // Titles for the boards behind this user's invite codes.
    function fetchAndRenderInvites() {
        fetch(BACKEND_URL + "/tix/my-invites", {
            method: "GET",
            headers: apiHeaders(),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to load invites, status " + res.status);
            }
            return res.json();
        })
        .then((boards) => {
            renderInvites(boards);
        })
        .catch((err) => {
            console.error("Failed to load invites:", err);
            renderInvites([]);
        });
    }

    loginButton.addEventListener("click", (e) => {
        if (currentUser) {
            enterLoggedOutState();
        } else {
            tokenClient.requestAccessToken();
        }
    });

    const createBoardButton = document.getElementById("create-board-button");
    const boardPop = document.getElementById("boardPop");
    const boardNameInput = document.getElementById("board-name-input");
    const inviteDomainCheckbox = document.getElementById("invite-domain-checkbox");
    const boardInviteEmailsInput = document.getElementById("board-invite-emails-input");
    const boardCancelButton = document.getElementById("board-cancel-button");
    const boardCreateButton = document.getElementById("board-create-button");

    function closeBoardPopup() {
        boardNameInput.value = '';
        inviteDomainCheckbox.checked = false;
        boardInviteEmailsInput.value = '';
        boardPop.style.display = "none";
    }

    createBoardButton.addEventListener("click", (e) => {
        boardPop.style.display = "flex";
    });

    boardCancelButton.addEventListener("click", (e) => {
        closeBoardPopup();
    });

    boardCreateButton.addEventListener("click", (e) => {
        if (!currentUser) {
            console.error("Can't create a board before logging in");
            return;
        }

        var title = boardNameInput.value.trim();
        if (!title) {
            return;
        }

        // Comma-separated emails from the textarea, trimmed and with any
        // empty entries dropped (trailing commas, extra whitespace, etc).
        var invitedEmails = boardInviteEmailsInput.value
            .split(',')
            .map((email) => email.trim())
            .filter((email) => email.length > 0);

        // TODO: the domain-invite checkbox still isn't wired to anything -
        // the backend only supports per-email invites right now.
        // Owner is not sent from here at all - the backend derives it from
        // the verified auth token instead of trusting this request.
        fetch(BACKEND_URL + "/tix/new-board", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
                title: title,
                invitedEmails: invitedEmails,
            }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Board creation failed with status " + res.status);
            }
            return res.json();
        })
        .then((board) => {
            addBoardListItem(board);
            closeBoardPopup();
        })
        .catch((err) => {
            console.error("Failed to create board:", err);
        });
    });

    boardInviteEmailsInput.addEventListener("input", () => {
        boardInviteEmailsInput.style.height = "auto";
        boardInviteEmailsInput.style.height = boardInviteEmailsInput.scrollHeight + "px";
    });

    const joinCodeButton = document.getElementById("join-code-button");
    const joinPop = document.getElementById("joinPop");
    const joinCodeInput = document.getElementById("join-code-input");
    const joinCancelButton = document.getElementById("join-cancel-button");
    const joinSubmitButton = document.getElementById("join-submit-button");

    function closeJoinPopup() {
        joinCodeInput.value = '';
        joinPop.style.display = "none";
    }

    joinCodeButton.addEventListener("click", (e) => {
        joinPop.style.display = "flex";
    });

    joinCancelButton.addEventListener("click", (e) => {
        closeJoinPopup();
    });

    joinSubmitButton.addEventListener("click", (e) => {
        var code = joinCodeInput.value.trim();
        if (!code) {
            return;
        }

        fetch(BACKEND_URL + "/tix/join-board", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ code: code }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Invalid code or failed to join, status " + res.status);
            }
            return res.json();
        })
        .then((board) => {
            addBoardListItem(board);
            closeJoinPopup();
        })
        .catch((err) => {
            console.error("Failed to join board:", err);
            // TODO: surface this to the user inline rather than just the
            // console - right now a bad code just silently does nothing
            // visible in the popup itself.
        });
    });

    // ----- Accept/decline invite popup -----

    const invitePop = document.getElementById("invitePop");
    const inviteBoardTitle = document.getElementById("invite-board-title");
    const inviteAcceptButton = document.getElementById("invite-accept-button");
    const inviteDeclineButton = document.getElementById("invite-decline-button");

    var currentInviteBoard = null;

    function openInvitePopup(board) {
        currentInviteBoard = board;
        inviteBoardTitle.textContent = "Accept invite to \"" + board.title + "\"?";
        invitePop.style.display = "flex";
    }

    function closeInvitePopup() {
        currentInviteBoard = null;
        invitePop.style.display = "none";
    }

    inviteAcceptButton.addEventListener("click", (e) => {
        if (!currentInviteBoard) return;

        fetch(BACKEND_URL + "/tix/join-board", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ code: currentInviteBoard.code }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to accept invite, status " + res.status);
            }
            return res.json();
        })
        .then((board) => {
            addBoardListItem(board);
            fetchAndRenderInvites();
            closeInvitePopup();
        })
        .catch((err) => {
            console.error("Failed to accept invite:", err);
        });
    });

    inviteDeclineButton.addEventListener("click", (e) => {
        if (!currentInviteBoard) return;

        fetch(BACKEND_URL + "/tix/decline-invite", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ code: currentInviteBoard.code }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to decline invite, status " + res.status);
            }
            fetchAndRenderInvites();
            closeInvitePopup();
        })
        .catch((err) => {
            console.error("Failed to decline invite:", err);
        });
    });

    restoreSessionIfPresent();
});
