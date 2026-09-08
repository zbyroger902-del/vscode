/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { resolveSessionId } from '../chatParticipantRequestHandler';

suite('resolveSessionId', () => {
	test('prefers the live request.sessionId over the history-derived id (fork case)', () => {
		// After forking, the live request carries the NEW fork id while the copied history still
		// carries the ORIGINAL id. The live id must win so hooks/telemetry/transcript stay on the fork.
		expect(resolveSessionId('new-fork-session', 'old-original-session')).toBe('new-fork-session');
	});

	test('falls back to the history-derived id when there is no live request session id', () => {
		expect(resolveSessionId(undefined, 'carried-over-session')).toBe('carried-over-session');
	});

	test('generates a fresh id when neither a live nor a history id is available', () => {
		expect(resolveSessionId(undefined, undefined)).toMatch(
			/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
		);
	});
});
