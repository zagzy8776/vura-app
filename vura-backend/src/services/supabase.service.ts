import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);
  isConfigured: boolean = false;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (supabaseUrl && supabaseKey) {
      this.client = createClient(supabaseUrl, supabaseKey);
      this.isConfigured = true;
      this.logger.log('Supabase client initialized');
    } else {
      this.logger.warn('Supabase URL and Key not configured - Supabase features disabled');
    }
  }
}
