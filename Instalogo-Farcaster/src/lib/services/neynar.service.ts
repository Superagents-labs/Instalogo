import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { FrameRequest } from "../../types";

export class NeynarService {
  private client: NeynarAPIClient;

  constructor() {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      throw new Error('NEYNAR_API_KEY environment variable is required');
    }
    
    this.client = new NeynarAPIClient(apiKey);
  }

  async validateFrameRequest(frameRequest: FrameRequest) {
    try {
      const response = await this.client.validateFrameAction(
        frameRequest.trustedData.messageBytes
      );
      
      if (!response || !response.valid || !response.action) {
        throw new Error('Invalid frame request');
      }

      return {
        isValid: response.valid,
        fid: response.action.interactor.fid,
        castHash: response.action.cast?.hash,
        buttonIndex: response.action.tapped_button.index,
        inputText: response.action.input?.text,
        timestamp: response.action.timestamp
      };
    } catch (error) {
      console.error('Frame validation error:', error);
      throw new Error('Failed to validate frame request');
    }
  }

  async getUserByFid(fid: number) {
    try {
      const response = await this.client.fetchBulkUsers([fid]);
      return response.users[0] || null;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }
}

export const neynarService = new NeynarService();
