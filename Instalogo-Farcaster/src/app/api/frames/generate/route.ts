import { NextRequest, NextResponse } from 'next/server';
import { FrameRequest } from '../../../../types';
import { neynarService } from '../../../../lib/services/neynar.service';
import { LogoGenerationModel } from '../../../../lib/models/LogoGeneration';
import { fluxService } from '../../../../lib/services/flux.service';
import { connectDB } from '../../../../lib/db/mongoose';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const frameRequest: FrameRequest = await request.json();
    const url = new URL(request.url);
    
    const validation = await neynarService.validateFrameRequest(frameRequest);
    
    if (!validation.isValid) {
      throw new Error('Invalid frame request');
    }

    const { fid, buttonIndex } = validation;
    const generationId = url.searchParams.get('id');
    
    if (!generationId) {
      throw new Error('Generation ID required');
    }
    
    // Handle cancel button
    if (buttonIndex === 2) {
      // Cancel the order
      await LogoGenerationModel.findByIdAndUpdate(generationId, {
        status: 'failed'
      });
      
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/cancelled.png">
            <meta property="fc:frame:button:1" content="🔄 Start New Order">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
            <title>Order Cancelled</title>
          </head>
          <body>
            <h1>Order Cancelled</h1>
            <p>Your logo generation order has been cancelled.</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Get the generation record
    const logoGeneration = await LogoGenerationModel.findById(generationId);
    
    if (!logoGeneration) {
      throw new Error('Generation record not found');
    }
    
    if (logoGeneration.fid !== fid) {
      throw new Error('Unauthorized access to generation record');
    }
    
    // If already completed, show results
    if (logoGeneration.status === 'completed' && logoGeneration.imageUrls.length > 0) {
      return new NextResponse(null, {
        status: 302,
        headers: {
          'Location': `${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results?id=${generationId}&fid=${fid}`
        }
      });
    }
    
    // Update status to generating
    logoGeneration.status = 'generating';
    await logoGeneration.save();
    
    console.log(`[Generate] Starting logo generation for FID ${fid}, Generation ID: ${generationId}`);
    
    // Show loading frame first
    const loadingFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/generating.png">
          <meta property="fc:frame:button:1" content="🔄 Check Progress">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results?id=${generationId}&fid=${fid}">
          <title>Generating Your Logo...</title>
        </head>
        <body>
          <h1>🎨 Creating Your Logo...</h1>
          <p>Business: "${logoGeneration.sessionData.businessName}"</p>
          <p>Style: ${logoGeneration.sessionData.style}</p>
          <p>This may take 30-60 seconds. Please wait...</p>
        </body>
      </html>
    `;
    
    // Start generation in background (don't await)
    generateLogosInBackground(logoGeneration).catch(error => {
      console.error('[Generate] Background generation failed:', error);
      LogoGenerationModel.findByIdAndUpdate(generationId, {
        status: 'failed'
      }).catch(console.error);
    });
    
    return new NextResponse(loadingFrameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Generate] Error:', error);
    
    const errorFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/error.png">
          <meta property="fc:frame:button:1" content="🔄 Try Again">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
          <title>Generation Error</title>
        </head>
        <body>
          <h1>Generation Error</h1>
          <p>Something went wrong while generating your logo. Please try again.</p>
        </body>
      </html>
    `;
    
    return new NextResponse(errorFrameHtml, {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}

// Background logo generation function
async function generateLogosInBackground(logoGeneration: any) {
  try {
    console.log(`[Background] Starting generation for ${logoGeneration._id}`);
    
    // Generate enhanced prompt
    const enhancedPrompt = fluxService.generatePrompt(logoGeneration.sessionData);
    console.log(`[Background] Using prompt: ${enhancedPrompt}`);
    
    // Generate logos using Flux AI
    const imageUrls = await fluxService.generateLogo(enhancedPrompt, logoGeneration.fid);
    
    console.log(`[Background] Generated ${imageUrls.length} images`);
    
    // Update the generation record
    logoGeneration.status = 'completed';
    logoGeneration.imageUrls = imageUrls;
    logoGeneration.completedAt = new Date();
    logoGeneration.prompt = enhancedPrompt; // Save the actual prompt used
    
    await logoGeneration.save();
    
    console.log(`[Background] Generation completed for ${logoGeneration._id}`);
    
  } catch (error) {
    console.error(`[Background] Generation failed for ${logoGeneration._id}:`, error);
    
    // Update status to failed
    logoGeneration.status = 'failed';
    await logoGeneration.save();
    
    throw error;
  }
}
