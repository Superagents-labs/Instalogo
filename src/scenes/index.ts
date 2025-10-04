// @ts-nocheck - Disable TypeScript checking for this file due to complex i18n integration
import { Scenes } from 'telegraf';
import { BotContext } from '../types';
import { createNameScene } from './name.scene';
import { createIndustryScene } from './industry.scene';
import { createStyleScene } from './style.scene';
import { createLogoWizardScene } from './logoWizard.scene';
import { createMemeWizardScene } from './memeWizard.scene';
import { createStickerWizardScene } from './stickerWizard.scene';
import { createEditImageWizardScene } from './editImageWizard.scene';
import { OpenAIService } from '../services/openai.service';
import { FluxService } from '../services/flux.service';
import { MongoDBService } from '../services/mongodb.service';
import { StorageService } from '../services/storage.service';
import { ensureWizardReset } from '../middleware/scene.middleware';

/**
 * Initialize all scenes and return a stage
 */
export function createScenes(
  openaiService: OpenAIService,
  fluxService: FluxService,
  mongodbService: MongoDBService,
  storageService: StorageService
) {
  // Create all scenes
  const nameScene = createNameScene();
  const industryScene = createIndustryScene();
  const styleScene = createStyleScene(openaiService, mongodbService, storageService);
  const logoWizardScene = createLogoWizardScene(openaiService, storageService);
  const memeWizardScene = createMemeWizardScene(openaiService, mongodbService);
  const stickerWizardScene = createStickerWizardScene(openaiService, fluxService);
  const editImageWizardScene = createEditImageWizardScene(openaiService);
  
  // Apply reset function to wizard scenes
  ensureWizardReset(logoWizardScene);
  ensureWizardReset(memeWizardScene);
  ensureWizardReset(stickerWizardScene);
  ensureWizardReset(editImageWizardScene);
  
  // Register all scenes - use type assertion to avoid the type conflict with i18n
  const stage = new Scenes.Stage([
    nameScene,
    industryScene,
    styleScene,
    logoWizardScene,
    memeWizardScene,
    stickerWizardScene,
    editImageWizardScene
  ]);
  
  return stage;
} 