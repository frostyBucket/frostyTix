/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import { BACKEND_URL, apiHeaders, loadSession } from './apiConfig.js';

console.log(
  '👋 This message is being logged by "renderer.js", included via Vite',
);


document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const boardId = params.get("boardId");
    const boardTitle = params.get("title");
    const boardCode = params.get("code");

    const session = loadSession();
    if (!session) {
        // No session token means no way to authenticate any of the calls
        // this page needs to make - back to the launchpad to log in.
        window.location.href = "index.html";
        return;
    }

    if (!boardId) {
        // Can't load or create tickets without knowing which board we're on.
        window.location.href = "index.html";
        return;
    }

    const titleEl = document.getElementById("title");
    titleEl.textContent = boardTitle || "Board";

    const welcomeEl = document.getElementById("welcome");
    welcomeEl.textContent = "Welcome, " + session.name.split(" ")[0];

    const boardIdNumber = Number(boardId);

    const backButton = document.getElementById("back-button");

    backButton.addEventListener("click", (e) => {
        window.location.href = "index.html";
    });

    const newTicketButton = document.getElementById("create-ticket");
    const ticketPop = document.getElementById("ticketPop");
    const titleInput = document.getElementById("title-input");
    const descriptionInput = document.getElementById("description-input");
    const cancelButton = document.getElementById("cancel-button");
    const createButton = document.getElementById("ticket-button");

    const priorityInput = document.getElementById("priority-input");
    const assignedToInput = document.getElementById("assigned-to-input");

    const createdContainer = document.getElementById("created-container");
    const inProgressContainer = document.getElementById("in-progress-container");
    const completedContainer = document.getElementById("completed-container");

    const allContainers = [createdContainer, inProgressContainer, completedContainer];

    const editPop = document.getElementById("editPop");
    const editTitleInput = document.getElementById("edit-title-input");
    const editDescriptionInput = document.getElementById("edit-description-input");
    const editPriorityInput = document.getElementById("edit-priority-input");
    const editAssignedToInput = document.getElementById("edit-assigned-to-input");
    const editCancelButton = document.getElementById("edit-cancel-button");
    const saveButton = document.getElementById("save-button");
    const deleteButton = document.getElementById("delete-button");

    var currentEditTicket = null;

    function containerForCompletion(completion) {
        var normalized = (completion || "").toLowerCase();

        if (normalized.indexOf("progress") !== -1) {
            return inProgressContainer;
        }
        if (normalized.indexOf("complet") !== -1 || normalized === "done") {
            return completedContainer;
        }
        return createdContainer;
    }

    // Reverse of containerForCompletion - picks the completion value to
    // persist based on which column a ticket landed in.
    function completionForContainer(container) {
        if (container === inProgressContainer) {
            return "in-progress";
        }
        if (container === completedContainer) {
            return "completed";
        }
        return "created";
    }

    // Shared PATCH helper - used by both drag-and-drop (completion only)
    // and the edit popup (title/description/priority/assigned). Only send
    // the fields that actually changed; the backend leaves anything else
    // untouched.
    function updateTicket(id, updates) {
        return fetch(BACKEND_URL + "/tix/update-ticket/" + id, {
            method: "PATCH",
            headers: apiHeaders(),
            body: JSON.stringify(updates),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to update ticket, status " + res.status);
            }
            return res.json();
        });
    }

    function openEditPopup(ticketEl) {
        currentEditTicket = ticketEl;
        editTitleInput.value = ticketEl.querySelector('.ticket-title').textContent;
        editDescriptionInput.value = ticketEl.querySelector('.ticket-desc').textContent;
        editPriorityInput.value = ticketEl.querySelector('.ticket-priority-badge').textContent;
        editAssignedToInput.value = ticketEl.querySelector('.ticket-assigned').textContent;
        editPop.style.display = "flex";
    }

    function closeEditPopup() {
        currentEditTicket = null;
        editPop.style.display = "none";
    }

    // Renders a ticket that already exists on the backend (has a real id and
    // completion status) into the right column.
    function renderTicketCard(ticket) {
        var newTick = document.createElement('div');
        newTick.classList.add('ticket-card', 'priority-' + ticket.priority.toLowerCase());
        newTick.dataset.id = String(ticket.id);
        newTick.draggable = true;

        var newTitle = document.createElement('p');
        newTitle.classList.add('ticket-title');
        newTitle.textContent = ticket.title;

        var newDesc = document.createElement('p');
        newDesc.classList.add('ticket-desc');
        newDesc.textContent = ticket.description;

        var footer = document.createElement('div');
        footer.classList.add('ticket-footer');

        var newPrior = document.createElement('span');
        newPrior.classList.add('ticket-priority-badge');
        newPrior.textContent = ticket.priority;

        var newAssigned = document.createElement('span');
        newAssigned.classList.add('ticket-assigned');
        newAssigned.textContent = ticket.assigned;

        footer.appendChild(newPrior);
        footer.appendChild(newAssigned);

        newTick.appendChild(newTitle);
        newTick.appendChild(newDesc);
        newTick.appendChild(footer);

        newTick.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", newTick.dataset.id);
            newTick.classList.add('dragging');
        });

        newTick.addEventListener("dragend", (e) => {
            newTick.classList.remove('dragging');
        });

        newTick.addEventListener("click", (e) => {
            openEditPopup(newTick);
        });

        containerForCompletion(ticket.completion).appendChild(newTick);
    }

    function loadTickets() {
        fetch(BACKEND_URL + "/tix/get-tix", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ id: boardIdNumber }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to load tickets, status " + res.status);
            }
            return res.json();
        })
        .then((tickets) => {
            tickets.forEach(renderTicketCard);
        })
        .catch((err) => {
            console.error("Failed to load tickets:", err);
        });
    }

    allContainers.forEach((container) => {
        container.addEventListener("dragover", (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });

        container.addEventListener("dragleave", (e) => {
            container.classList.remove('drag-over');
        });

        container.addEventListener("drop", (e) => {
            e.preventDefault();
            container.classList.remove('drag-over');
            var draggedId = e.dataTransfer.getData("text/plain");
            var draggedTicket = document.querySelector('[data-id="' + draggedId + '"]');
            if (draggedTicket) {
                container.appendChild(draggedTicket);

                updateTicket(draggedId, { completion: completionForContainer(container) })
                    .catch((err) => {
                        console.error("Failed to save ticket move:", err);
                    });
            }
        });
    });

    saveButton.addEventListener("click", (e) => {
        if (!currentEditTicket) return;

        var ticketId = currentEditTicket.dataset.id;
        var newPriority = editPriorityInput.value;

        updateTicket(ticketId, {
            title: editTitleInput.value,
            description: editDescriptionInput.value,
            priority: newPriority,
            assigned: editAssignedToInput.value,
        })
        .then((updated) => {
            currentEditTicket.querySelector('.ticket-title').textContent = updated.title;
            currentEditTicket.querySelector('.ticket-desc').textContent = updated.description;
            currentEditTicket.querySelector('.ticket-priority-badge').textContent = updated.priority;
            currentEditTicket.querySelector('.ticket-assigned').textContent = updated.assigned;

            currentEditTicket.classList.remove('priority-high', 'priority-medium', 'priority-low');
            currentEditTicket.classList.add('priority-' + updated.priority.toLowerCase());

            closeEditPopup();
        })
        .catch((err) => {
            console.error("Failed to save ticket:", err);
        });
    });

    deleteButton.addEventListener("click", (e) => {
        if (!currentEditTicket) return;

        var ticketId = currentEditTicket.dataset.id;

        fetch(BACKEND_URL + "/tix/delete-ticket/" + ticketId, {
            method: "DELETE",
            headers: apiHeaders(),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to delete ticket, status " + res.status);
            }
            currentEditTicket.remove();
            closeEditPopup();
        })
        .catch((err) => {
            console.error("Failed to delete ticket:", err);
        });
    });

    editCancelButton.addEventListener("click", (e) => {
        closeEditPopup();
    });

    createButton.addEventListener("click", (e) => {
        var title = titleInput.value.trim();
        if (!title) {
            return;
        }

        fetch(BACKEND_URL + "/tix/new-ticket", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
                title: title,
                description: descriptionInput.value,
                assigned: assignedToInput.value,
                priority: priorityInput.value,
                boardKey: boardIdNumber,
            }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to create ticket, status " + res.status);
            }
            return res.json();
        })
        .then((newTicket) => {
            renderTicketCard(newTicket);
            titleInput.value = '';
            descriptionInput.value = '';
            ticketPop.style.display = "none";
        })
        .catch((err) => {
            console.error("Failed to create ticket:", err);
        });
    });

    newTicketButton.addEventListener("click", (e) => {
        ticketPop.style.display = "flex";
    });

    cancelButton.addEventListener("click", (e) => {
        descriptionInput.value = '';
        titleInput.value = '';
        ticketPop.style.display = "none";
    });

    titleInput.addEventListener("input", () => {
        titleInput.style.height = "auto";
        titleInput.style.height = titleInput.scrollHeight + "px";
    });

    descriptionInput.addEventListener("input", () => {
        descriptionInput.style.height = "auto";
        descriptionInput.style.height = descriptionInput.scrollHeight + "px";
    });

    const inviteUserButton = document.getElementById("invite-user-button");
    const invitePop = document.getElementById("invitePop");
    const inviteCodeDisplay = document.getElementById("invite-code-display");
    const inviteEmailInput = document.getElementById("invite-email-input");
    const inviteCloseButton = document.getElementById("invite-close-button");
    const inviteSendButton = document.getElementById("invite-send-button");

    function closeInvitePopup() {
        inviteEmailInput.value = '';
        invitePop.style.display = "none";
    }

    inviteUserButton.addEventListener("click", (e) => {
        inviteCodeDisplay.textContent = boardCode || "unknown";
        invitePop.style.display = "flex";
    });

    inviteCloseButton.addEventListener("click", (e) => {
        closeInvitePopup();
    });

    inviteSendButton.addEventListener("click", (e) => {
        var email = inviteEmailInput.value.trim();
        if (!email || !boardCode) {
            return;
        }

        fetch(BACKEND_URL + "/tix/invite-to-board", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({ code: boardCode, email: email }),
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error("Failed to invite user, status " + res.status);
            }
            inviteEmailInput.value = '';
        })
        .catch((err) => {
            console.error("Failed to invite user:", err);
            // TODO: surface this to the user inline - right now a failed
            // invite (e.g. not a board member) just fails silently in the UI.
        });
    });

    loadTickets();
});
