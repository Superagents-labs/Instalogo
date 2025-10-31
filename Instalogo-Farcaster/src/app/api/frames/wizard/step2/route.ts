import { NextRequest, NextResponse } from 'next/server';
import { FrameRequest } from '../../../../../types';
import { neynarService } from '../../../../../lib/services/neynar.service';
import { connectDB } from '../../../../../lib/db/mongoose';

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
    const businessName = url.searchParams.get('name') || 'Your Business';
    
    // Map button index to industry
    const industryMap: { [key: number]: string } = {
      1: 'Business',
      2: 'Creative', 
      3: 'Tech',
      4: 'Food & Drink'
    };
    
    const selectedIndustry = industryMap[buttonIndex] || 'Business';
    
    console.log(`[Wizard Step 2] FID ${fid} selected industry: ${selectedIndustry} for business: ${businessName}`);
    
    const frameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/wizard-step3.png">
          <meta property="fc:frame:button:1" content="🎯 Modern & Clean">
          <meta property="fc:frame:button:2" content="🎨 Creative & Bold">
          <meta property="fc:frame:button:3" content="💎 Elegant & Premium">
          <meta property="fc:frame:button:4" content="⚡ Generate Logo!">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step3?name=${encodeURIComponent(businessName)}&industry=${encodeURIComponent(selectedIndustry)}&fid=${fid}">
          <title>Step 3: Choose Style</title>
        </head>
        <body>
          <h1>"${businessName}" - ${selectedIndustry}</h1>
          <p>Choose your logo style or generate with current settings</p>
        </body>
      </html>
    `;
    
    return new NextResponse(frameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Wizard Step 2] Error:', error);
    
    const errorFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/error.png">
          <meta property="fc:frame:button:1" content="🔄 Start Over">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
          <title>Error</title>
        </head>
        <body>
          <h1>Something went wrong</h1>
          <p>Let's start over</p>
        </body>
      </html>
    `;
    
    return new NextResponse(errorFrameHtml, {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}
