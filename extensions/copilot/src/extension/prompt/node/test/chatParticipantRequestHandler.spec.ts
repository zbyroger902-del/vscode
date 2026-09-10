/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { ChatParticipantRequestHandler, addHistoryToConversation, resolveSessionId } from '../chatParticipantRequestHandler';
import { ChatResponseTurn } from '../../../../util/common/test/shims/chatTypes';
import { IConversationStore } from '../../../conversationStore/node/conversationStore';
import { IIntentService } from '../../../intents/node/intentService';
import { Conversation } from '../../common/conversation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { SpyChatResponseStream } from '../../../../util/common/test/mockChatResponseStream';
import { IWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { NullWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/nullWorkspaceFileIndex';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

function buildHandlerServices() {
	const services = createExtensionUnitTestingServices();

	// Empty Map-backed mock so the history lookup short-circuits (no heavy deserialization).
	const conversations = new Map<string, Conversation>();
	services.define(IConversationStore, {
		_serviceBrand: undefined,
		addConversation: (id, conv) => { conversations.set(id, conv); },
		getConversation: id => conversations.get(id),
		lastConversation: undefined,
	});

	// The handler's constructor creates an IntentDetector, which transitively needs these.
	services.define(IIntentService, {
		_serviceBrand: undefined,
		unknownIntent: undefined as never,
		getIntents: () => [],
		getIntent: () => undefined,
	});
	services.define(IWorkspaceFileIndex, new NullWorkspaceFileIndex());

	return services.createTestingAccessor();
}

suite('resolveSessionId', () => {
	test('probe: a chatTypes ChatResponseTurn is recognized by addHistoryToConversation', () => {
		// Via the shim's non-private chatTypes ctor; matches what the handler's `instanceof` checks.
		const turn = new ChatResponseTurn(
			[],
			{ metadata: { sessionId: 'old-session-id', responseId: 'resp-1' } } as any,
			'test'
		);

		const accessor = buildHandlerServices();
		const insta = accessor.get(IInstantiationService);

		const { sessionId } = insta.invokeFunction(accessor => addHistoryToConversation(accessor, [turn]));
		expect(sessionId).toBe('old-session-id');
	});

	test('prefers the live request.sessionId over the history-derived id (fork case)', () => {
		// Fork copies history whose metadata still holds the ORIGINAL id; the live fork id must win.
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

suite('ChatParticipantRequestHandler (integration)', () => {
	test('attributes a forked request to the live session id, not the history-derived one', async () => {
		const OLD_SESSION_ID = 'old-session-id';
		const NEW_SESSION_ID = 'new-fork-session-id';

		// History copied from the ORIGINAL session still carries its metadata in the OLD id.
		const historyTurn = new ChatResponseTurn(
			[],
			{ metadata: { sessionId: OLD_SESSION_ID, responseId: 'resp-1' } } as any,
			'test'
		);

		// The live request belongs to the NEW (fork) session.
		const request = new TestChatRequest('continue here');
		request.sessionId = NEW_SESSION_ID;

		const accessor = buildHandlerServices();
		const insta = accessor.get(IInstantiationService);
		const handler = insta.createInstance(
			ChatParticipantRequestHandler,
			[historyTurn],                       // rawHistory carrying the OLD id
			request,                             // request carrying the NEW id
			new SpyChatResponseStream(),
			CancellationToken.None,
			{ agentName: 'test', agentId: 'test' },
			() => false,
			undefined
		);

		expect(handler.conversation.sessionId).toBe(NEW_SESSION_ID);

		// getResult() must not be called here — it would hit a real endpoint.
	});
});

