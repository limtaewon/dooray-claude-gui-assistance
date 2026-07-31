"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentNotificationId = buildAgentNotificationId;
function buildAgentNotificationId({ worktreeId, paneKey, stateStartedAt }) {
    if (!worktreeId || !paneKey || typeof stateStartedAt !== 'number') {
        return null;
    }
    if (!Number.isFinite(stateStartedAt)) {
        return null;
    }
    return [
        'agent',
        encodeURIComponent(worktreeId),
        encodeURIComponent(paneKey),
        String(Math.trunc(stateStartedAt))
    ].join(':');
}
