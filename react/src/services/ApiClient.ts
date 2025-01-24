import { logger as log} from './logger';

const API_URL = 'http://localhost:7860'

export interface AiFilter {
  creator_id?: string;
  has_association?: boolean;
  is_published?: boolean;
  is_community?: boolean;
  last_interaction_after?: string;  // ISO date string
  last_interaction_before?: string; // ISO date string
  search_term?: string;
}

class ApiClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  private async fetchWithOptionalAuth(url: string, options: RequestInit = {}, token?: string) {
    const headers: HeadersInit = {
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });
    console.log("[ApiClient] Response:", response);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }


  async connectToAi() {
    const spawnerUrl = this.apiUrl + '/get_daily_url_token';
    try {
      const data = await this.fetchWithOptionalAuth(spawnerUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
      });
      const daily_url = data.daily_url;
      const daily_token = data.daily_token;
      log.info("Response from connect to ai:", data);
      return { daily_url, daily_token };
    } catch (error) {
      log.error('Failed to connect to ai:', error);
      throw error;
    }
  }

  async connectToAiPool(dailyRoomUrl: string, dailyToken: string) {
    const aiPoolConnectUrl = this.apiUrl + '/connect';
    const data = await this.fetchWithOptionalAuth(aiPoolConnectUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ daily_room_url: dailyRoomUrl, daily_token: dailyToken })
    });
    return data;
  }
}

const apiClient = new ApiClient(API_URL);

export { apiClient as ApiClient };

