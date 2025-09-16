import { Scenes } from 'telegraf';
import { IUser } from '../models/User';
import { I18n } from 'telegraf-i18n';

/**
 * Custom session data structure
 */
export interface SessionData extends Scenes.WizardSessionData {
  [key: string]: any;
  name?: string;
  tagline?: string;
  mission?: string;
  vibe?: string;
  audience?: string;
  stylePreferences?: string[];
  colorPreferences?: string;
  typography?: string;
  iconIdea?: string;
  inspiration?: string;
  finalNotes?: string;
  __step?: number | string;
  industry?: string;
  generatedImages?: string[];
  selectedImageIndex?: number;
  lastPrompt?: string;
  memeImageFileId?: string;
  memeText?: string;
  memeMood?: string;
  memeElements?: string;
  memeAISuggest?: boolean;
  selectedStickers?: string[];
}

/**
 * Bot context with session and scene context
 */
export interface BotContext extends Scenes.WizardContext<SessionData> {
  dbUser?: IUser;
  i18n: I18n;
}

/**
 * Logo generation request parameters
 */
export interface LogoGenerationParams {
  businessName: string;
  industry: string;
  style: string;
  includeIcon?: boolean;
}

/**
 * Logo generation result
 */
export interface GeneratedLogo {
  imageUrls: string[];
  prompt: string;
  timestamp: number;
}

/**
 * Storage options for Cloudinary
 */
export interface StorageOptions {
  key?: string;
  contentType?: string;
  folder?: string;
}

/**
 * Rate limiting data
 */
export interface RateLimitInfo {
  userId: number;
  requestCount: number;
  generationCount: number;
  resetDate: number;
}

/**
 * Branding guide details
 */
export interface BrandingGuideDetails {
  businessName: string;
  industry: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColors: string[];
  fontSuggestions: string[];
}