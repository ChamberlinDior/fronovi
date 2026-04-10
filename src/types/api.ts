export type ApiResponse<T> = {
  success: boolean;
  message: string;
  errorCode?: string;
  data: T;
  validationErrors?: Record<string, string>;
  timestamp: string;
};

export type UserRole = 'DRIVER' | 'CLIENT' | 'ADMIN' | 'PARTNER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type DriverStatus = 'OFFLINE' | 'ONLINE' | 'ON_RIDE' | 'SOS';
export type RideStatus =
  | 'REQUESTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAID'
  | 'CANCELLED_BY_CLIENT'
  | 'CANCELLED_BY_DRIVER';

export type QrCodeStatus = 'ACTIVE' | 'USED' | 'EXPIRED';

export type UserResponse = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  profilePictureUrl?: string;
  dateOfBirth?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
};

export type Vehicle = {
  id?: string;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  seats?: number;
  status?: string;
};

export type DriverProfile = {
  id: string;
  user?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    profilePictureUrl?: string;
    dateOfBirth?: string;
  };
  licenseNumber?: string;
  licenseExpiryDate?: string;
  nationalId?: string;
  status: DriverStatus;
  currentLatitude?: number;
  currentLongitude?: number;
  rating?: number;
  totalRides?: number;
  totalEarnings?: number;
  verified?: boolean;
  currentVehicle?: Vehicle;
  createdAt?: string;
  updatedAt?: string;
};

export type RideResponse = {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  estimatedDistanceKm?: number;
  estimatedDurationMinutes?: number;
  estimatedFare?: number;
  actualFare?: number;
  status: RideStatus;
  requestedAt?: string;
  completedAt?: string;
  clientRating?: number | null;
  driverRating?: number | null;
};

export type WalletResponse = {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  active: boolean;
};

export type TransactionResponse = {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
};

export type PageResponse<T> = {
  content: T[];
  totalPages: number;
  totalElements: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
};

export type QrCodeResponse = {
  id: string;
  rideId: string;
  token: string;
  qrCodeImage: string;
  amount: number;
  status: QrCodeStatus;
  expiresAt: string;
  valid: boolean;
};

export type LoginPayload = {
  identifier: string;
  password: string;
  deviceInfo: string;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber: string;
  password: string;
  role: 'DRIVER';
};