/**
 * User Profile and Address Management Service
 */

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';

const MAX_ADDRESSES = 10;

export interface AddressInput {
  label?: string;
  street: string;
  city: string;
  state: string;
  pinCode: string;
  landmark?: string;
  isDefault?: boolean;
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
      languagePref: true,
      themePref: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

export async function updateProfile(
  userId: string,
  data: { name?: string; email?: string; phone?: string },
) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new AppError('User not found', 404);
  }

  if (data.email && data.email !== existing.email) {
    const emailTaken = await prisma.user.findUnique({ where: { email: data.email } });
    if (emailTaken) {
      throw new AppError('Email is already in use', 409);
    }
    logger.info('Email update requested – verification email would be sent', {
      userId,
      newEmail: data.email,
    });
  }

  if (data.phone && data.phone !== existing.phone) {
    const phoneTaken = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (phoneTaken) {
      throw new AppError('Phone number is already in use', 409);
    }
  }

  const updateData: {
    name?: string;
    email?: string;
    emailVerified?: boolean;
    phone?: string;
  } = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) {
    updateData.email = data.email;
    if (data.email !== existing.email) {
      updateData.emailVerified = false;
    }
  }
  if (data.phone !== undefined) updateData.phone = data.phone;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      isActive: true,
      emailVerified: true,
      phoneVerified: true,
      languagePref: true,
      themePref: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info('User profile updated', { userId });
  return updated;
}

export async function getAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
  });
}

export async function addAddress(userId: string, data: AddressInput) {
  const count = await prisma.address.count({ where: { userId } });
  if (count >= MAX_ADDRESSES) {
    throw new AppError(
      `You can save a maximum of ${MAX_ADDRESSES} addresses. Please delete one before adding a new one.`,
      400,
    );
  }

  if (data.isDefault) {
    await prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      userId,
      label: data.label ?? 'Home',
      street: data.street,
      city: data.city,
      state: data.state,
      pinCode: data.pinCode,
      landmark: data.landmark,
      isDefault: data.isDefault ?? false,
    },
  });

  logger.info('Address added', { userId, addressId: address.id });
  return address;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  data: Partial<AddressInput>,
) {
  const existing = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });

  if (!existing) {
    throw new AppError('Address not found', 404);
  }

  if (data.isDefault) {
    await prisma.address.updateMany({
      where: { userId, isDefault: true, id: { not: addressId } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.address.update({
    where: { id: addressId },
    data: {
      ...(data.label !== undefined && { label: data.label }),
      ...(data.street !== undefined && { street: data.street }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.state !== undefined && { state: data.state }),
      ...(data.pinCode !== undefined && { pinCode: data.pinCode }),
      ...(data.landmark !== undefined && { landmark: data.landmark }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
    },
  });

  logger.info('Address updated', { userId, addressId });
  return updated;
}

export async function deleteAddress(userId: string, addressId: string) {
  const existing = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });

  if (!existing) {
    throw new AppError('Address not found', 404);
  }

  await prisma.address.delete({ where: { id: addressId } });

  logger.info('Address deleted', { userId, addressId });
}

export async function setDefaultAddress(userId: string, addressId: string) {
  const existing = await prisma.address.findFirst({
    where: { id: addressId, userId },
  });

  if (!existing) {
    throw new AppError('Address not found', 404);
  }

  await prisma.address.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  });

  const updated = await prisma.address.update({
    where: { id: addressId },
    data: { isDefault: true },
  });

  logger.info('Default address set', { userId, addressId });
  return updated;
}
