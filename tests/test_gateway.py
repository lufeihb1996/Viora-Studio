import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock

import httpx
import server

PRIVATE = 'https://private-gateway.invalid'
PROMPT_ID = 'job-123'

class GatewayIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.output = Path(self.tmp.name)
        (self.output / 'settings.json').write_text(json.dumps({'comfy_url': PRIVATE}), encoding='utf8')
        (self.output / 'history.json').write_text('[]', encoding='utf8')
        self.patches = [patch.object(server, 'OUTPUTS_DIR', self.output), patch.object(server, 'SETTINGS_FILE', self.output / 'settings.json'), patch.object(server, 'HISTORY_FILE', self.output / 'history.json'), patch.object(server, 'DEFAULT_GATEWAY_URL', ''), patch.object(server, '_watch_comfy_ws', AsyncMock())]
        for p in self.patches: p.start()
        self.running = []
        self.pending = []
        self.sent = 0
        def upstream(req):
            if req.url.path.endswith('/rpc/viora_claim_generation'):
                return httpx.Response(200, json='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
            if req.url.path.endswith('/rpc/viora_release_generation'):
                return httpx.Response(200, json=None)
            if req.url.path == '/system_stats': return httpx.Response(200, json={'devices': []})
            if req.url.path == '/queue': return httpx.Response(200, json={'queue_running': self.running, 'queue_pending': self.pending})
            if req.url.path == '/prompt':
                self.sent += 1
                return httpx.Response(200, json={'prompt_id': PROMPT_ID})
            if req.url.path == '/history/' + PROMPT_ID: return httpx.Response(200, json={PROMPT_ID: {'outputs': {'10': {'images': [{'filename':'test.png','subfolder':'generated','type':'output'}]}}}})
            if req.url.path == '/view': return httpx.Response(200, content=b'png')
            return httpx.Response(404)
        self.gateway_patch = patch.object(server, 'make_http_client', side_effect=lambda *args, **kwargs: httpx.AsyncClient(transport=httpx.MockTransport(upstream)))
        self.gateway_patch.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        self.gateway_patch.stop()
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()

    async def test_settings_file_and_remote_overrides_not_exposed(self):
        for path in ['/outputs/settings.json', '/outputs/history.json', '/api/moss?action=settings']:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 404)
            self.assertNotIn(PRIVATE, response.text)
        response = await self.client.get('/api/moss?action=ping&gateway_url=https://evil.invalid')
        self.assertEqual(response.status_code, 400)
        response = await self.client.post('/api/moss?action=prompt', json={'prompt':'x','comfy_url':'https://evil.invalid'})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn(PRIVATE, response.text)

    async def test_ping_and_generation_work_without_exposing_gateway(self):
        response = await self.client.get('/api/moss?action=ping')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['online'])
        self.assertNotIn(PRIVATE, response.text)
        response = await self.client.post('/api/moss?action=prompt', json={'prompt':'sample'}, headers={'Authorization':'Bearer test-token'})
        self.assertEqual(response.json()['prompt_id'], PROMPT_ID)
        self.assertNotIn(PRIVATE, response.text)
        response = await self.client.get('/api/moss?action=status&prompt_id=' + PROMPT_ID)
        self.assertEqual(response.json()['status'], 'DONE')
        self.assertNotIn(PRIVATE, response.text)
        image = await self.client.get(response.json()['item']['media_url'])
        self.assertEqual(image.content, b'png')


    async def test_busy_queue_blocks_submission_and_requires_login(self):
        self.running = [[1, 'another-user']]
        self.pending = [[2, 'waiting-job']]
        ping = await self.client.get('/api/moss?action=ping')
        self.assertEqual(ping.json()['running'], 1)
        self.assertEqual(ping.json()['pending'], 1)
        self.assertTrue(ping.json()['queue_available'])
        unauthorized = await self.client.post('/api/moss?action=prompt', json={'prompt':'sample'})
        self.assertEqual(unauthorized.status_code, 401)
        response = await self.client.post('/api/moss?action=prompt', json={'prompt':'sample'}, headers={'Authorization':'Bearer test-token'})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.sent, 0)

if __name__ == '__main__': unittest.main()
