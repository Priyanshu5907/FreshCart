import request from 'supertest';
import { createApp } from '../app';
import * as userService from '../services/user.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    address: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    oauthAccount: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { set: jest.fn(), get: jest.fn(), del: jest.fn(), call: jest.fn() },
  redisSub: { on: jest.fn() },
  default: { set: jest.fn(), get: jest.fn(), del: jest.fn(), call: jest.fn() },
}));

jest.mock('../lib/metrics', () => ({
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  httpRequestsTotal: { inc: jest.fn() },
  httpRequestDurationSeconds: { observe: jest.fn(), startTimer: jest.fn().mockReturnValue(jest.fn()) },
  activeWebsocketConnections: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  cacheHitRatio: { set: jest.fn() },
  notificationQueueDepth: { set: jest.fn() },
  collectDefaultMetrics: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();

function makeAccessToken(userId = 'user-1', role: UserRole = UserRole.CUSTOMER): string {
  return signAccessToken({ userId, role, email: 'test@example.com' });
}

const sampleProfile = {
  id: 'user-1',
  email: 'alice@example.com',
  phone: null,
  name: 'Alice',
  role: UserRole.CUSTOMER,
  isActive: true,
  emailVerified: false,
  phoneVerified: false,
  languagePref: 'en',
  themePref: 'light',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

const sampleAddress = {
  id: 'addr-1',
  userId: 'user-1',
  label: 'Home',
  street: '123 Main St',
  city: 'Mumbai',
  state: 'Maharashtra',
  pinCode: '400001',
  landmark: null,
  isDefault: false,
};

describe('GET /api/users/me', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with user profile for authenticated user', async () => {
    jest.spyOn(userService, 'getProfile').mockResolvedValue(sampleProfile);
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'user-1', name: 'Alice' });
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/users/me', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 when name is updated', async () => {
    jest.spyOn(userService, 'updateProfile').mockResolvedValue({ ...sampleProfile, name: 'Alice Updated' });
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`).send({ name: 'Alice Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Alice Updated');
  });

  it('returns 200 with verification message when email is changed', async () => {
    jest.spyOn(userService, 'updateProfile').mockResolvedValue({ ...sampleProfile, email: 'new@example.com' });
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`).send({ email: 'new@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verification email/i);
  });

  it('returns 400 when no fields provided', async () => {
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`).send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`).send({ email: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already in use', async () => {
    jest.spyOn(userService, 'updateProfile').mockRejectedValue(new AppError('Email is already in use', 409));
    const res = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${makeAccessToken()}`).send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/users/me/addresses', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with address list', async () => {
    jest.spyOn(userService, 'getAddresses').mockResolvedValue([sampleAddress]);
    const res = await request(app).get('/api/users/me/addresses').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/users/me/addresses');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/users/me/addresses', () => {
  const validAddress = { label: 'Home', street: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pinCode: '400001' };

  afterEach(() => jest.restoreAllMocks());

  it('returns 201 on success', async () => {
    jest.spyOn(userService, 'addAddress').mockResolvedValue(sampleAddress);
    const res = await request(app).post('/api/users/me/addresses').set('Authorization', `Bearer ${makeAccessToken()}`).send(validAddress);
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid PIN code', async () => {
    const res = await request(app).post('/api/users/me/addresses').set('Authorization', `Bearer ${makeAccessToken()}`).send({ ...validAddress, pinCode: '1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when 10 addresses already exist', async () => {
    jest.spyOn(userService, 'addAddress').mockRejectedValue(new AppError('You can save a maximum of 10 addresses. Please delete one before adding a new one.', 400));
    const res = await request(app).post('/api/users/me/addresses').set('Authorization', `Bearer ${makeAccessToken()}`).send(validAddress);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum of 10/i);
  });
});

describe('PUT /api/users/me/addresses/:id', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 on success', async () => {
    jest.spyOn(userService, 'updateAddress').mockResolvedValue({ ...sampleAddress, city: 'Pune' });
    const res = await request(app).put('/api/users/me/addresses/addr-1').set('Authorization', `Bearer ${makeAccessToken()}`).send({ city: 'Pune' });
    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe('Pune');
  });

  it('returns 404 for non-existent address', async () => {
    jest.spyOn(userService, 'updateAddress').mockRejectedValue(new AppError('Address not found', 404));
    const res = await request(app).put('/api/users/me/addresses/bad-id').set('Authorization', `Bearer ${makeAccessToken()}`).send({ city: 'Delhi' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/me/addresses/:id', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 on success', async () => {
    jest.spyOn(userService, 'deleteAddress').mockResolvedValue(undefined);
    const res = await request(app).delete('/api/users/me/addresses/addr-1').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent address', async () => {
    jest.spyOn(userService, 'deleteAddress').mockRejectedValue(new AppError('Address not found', 404));
    const res = await request(app).delete('/api/users/me/addresses/bad-id').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/me/addresses/:id/default', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with default address set', async () => {
    jest.spyOn(userService, 'setDefaultAddress').mockResolvedValue({ ...sampleAddress, isDefault: true });
    const res = await request(app).patch('/api/users/me/addresses/addr-1/default').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);
  });

  it('returns 404 for non-existent address', async () => {
    jest.spyOn(userService, 'setDefaultAddress').mockRejectedValue(new AppError('Address not found', 404));
    const res = await request(app).patch('/api/users/me/addresses/bad-id/default').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(404);
  });
});
