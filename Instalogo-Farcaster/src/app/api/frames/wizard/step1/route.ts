import { NextRequest, NextResponse } from 'next/server';
import { FrameRequest } from '../../../../../types';
import { neynarService } from '../../../../../lib/services/neynar.service';
import { FarcasterUserModel } from '../../../../../lib/models/FarcasterUser';
import { connectDB } from '../../../../../lib/db/mongoose';

export async function GET() {
  const frameHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta property="fc:frame" content="vNext">
        <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/wizard-step1.png">
        <meta property="fc:frame:input:text" content="Enter your business name">
        <meta property="fc:frame:button:1" content="Next Step →">
        <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step1">
        <title>Step 1: Business Name</title>
      </head>
      <body>
        <h1>Logo Wizard - Step 1</h1>
        <p>Enter your business name to get started</p>
      </body>
    </html>
  `;
  
  return new NextResponse(frameHtml, {
    headers: { 'Content-Type': 'text/html' }
  });
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const frameRequest: FrameRequest = await request.json();
    
    const validation = await neynarService.validateFrameRequest(frameRequest);
    
    if (!validation.isValid) {
      throw new Error('Invalid frame request');
    }

    const { fid, inputText } = validation;
    
    // Get or create user
    let user = await FarcasterUserModel.findOne({ fid });
    if (!user) {
      const userProfile = await neynarService.getUserByFid(fid);
      user = new FarcasterUserModel({
        fid,
        username: userProfile?.username || `user-${fid}`,
        ethBalance: 0,
        freeGenerationUsed: false
      });
      await user.save();
      console.log(`[Wizard] Created new user: FID ${fid}`);
    }

    // Validate business name input
    if (!inputText || inputText.trim().length === 0) {
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/wizard-step1-error.png">
            <meta property="fc:frame:input:text" content="Please enter your business name">
            <meta property="fc:frame:button:1" content="Try Again">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step1">
            <title>Step 1: Business Name Required</title>
          </head>
          <body>
            <h1>Business Name Required</h1>
            <p>Please enter your business name to continue</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Save business name and proceed to step 2
    const businessName = inputText.trim();
    
    // Store session data (in production, use Redis or similar)
    // For now, we'll pass it in the URL or use a simple in-memory store
    
    const frameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/wizard-step2.png">
          <meta property="fc:frame:button:1" content="🏢 Business">
          <meta property="fc:frame:button:2" content="🎨 Creative">
          <meta property="fc:frame:button:3" content="⚡ Tech">
          <meta property="fc:frame:button:4" content="🍽️ Food & Drink">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step2?name=${encodeURIComponent(businessName)}&fid=${fid}">
          <title>Step 2: Choose Industry</title>
        </head>
        <body>
          <h1>Great! "${businessName}"</h1>
          <p>Now choose your industry category</p>
        </body>
      </html>
    `;
    
    return new NextResponse(frameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Wizard Step 1] Error:', error);
    
    const errorFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/error.png">
          <meta property="fc:frame:button:1" content="🔄 Try Again">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step1">
          <title>Error</title>
        </head>
        <body>
          <h1>Something went wrong</h1>
          <p>Please try again</p>
        </body>
      </html>
    `;
    
    return new NextResponse(errorFrameHtml, {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}
