const API_BASE_URL = import.meta.env.VITE_API_URL || '';

let authToken: string | null = localStorage.getItem('admin_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('admin_token', token);
  } else {
    localStorage.removeItem('admin_token');
  }
}

export function getAuthToken() {
  return authToken;
}

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export async function login(email: string, password: string) {
  const response = await apiCall<{ token: string; user: any }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(response.token);
  return response;
}

export async function logout() {
  setAuthToken(null);
}

export interface TechnicianProfile {
  id: string;
  name: string;
  phone: string | null;
  truckId: string | null;
  active: boolean;
  region: string | null;
  supervisorId: string | null;
}

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt?: string;
  technicianProfile: TechnicianProfile | null;
}

export interface UsersResponse {
  items: User[];
  nextCursor: string | null;
}

export async function getTechnicians(role: string = 'technician'): Promise<UsersResponse> {
  return apiCall<UsersResponse>(`/api/users?role=${role}`);
}

export interface CreateUserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  region?: string;
}

export async function createUser(data: CreateUserData): Promise<User> {
  return apiCall<User>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: string, data: Partial<CreateUserData & { active: boolean }>): Promise<User> {
  return apiCall<User>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<{ message: string; id: string }> {
  return apiCall<{ message: string; id: string }>(`/api/users/${id}`, {
    method: 'DELETE',
  });
}
