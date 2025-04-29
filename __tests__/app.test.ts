import request from 'supertest';
import { createApp, redisClient } from '../app';
import axios from 'axios';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

let app: any;
beforeAll(async () => {
  mockAxios.get.mockResolvedValue({ data: { items: ['test'] } });
  app = await createApp();
});
afterAll(async () => {
  await redisClient.disconnect();
});

describe('App routes', () => {
  it('GET /health returns 200', async () => {
    await request(app).get('/health').expect(200);
  });

  it('GET /ready returns checks object', async () => {
    const res = await request(app).get('/ready');
    expect(res.body).toHaveProperty('checks');
    expect([200, 503]).toContain(res.status);
  });

  it('GET / returns status ok', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /filters returns list', async () => {
    const res = await request(app).get('/filters');
    expect(res.status).toBe(200);
    expect(res.body.filters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'searchType' })])
    );
  });

  it('GET /tools returns tools array', async () => {
    const res = await request(app).get('/tools');
    expect(res.status).toBe(200);
    expect(res.body.tools[0]).toHaveProperty('name', 'search');
  });

  it('GET /metrics returns Prometheus text', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/search_requests_total/);
  });

  it('Unknown route returns 404', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 404, message: 'Not Found' });
  });

  it('GET /search without q returns 400', async () => {
    const res = await request(app).get('/search');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
  });

  it('GET /search?q=test returns data', async () => {
    const res = await request(app).get('/search').query({ q: 'test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: ['test'] });
  });
});
