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
    const industry = url.searchParams.get('industry') || 'Business';
    
    // Map button index to style or action
    const styleMap: { [key: number]: string } = {
      1: 'Modern & Clean',
      2: 'Creative & Bold', 
      3: 'Elegant & Premium',
      4: 'default' // Generate with current settings
    };
    
    const selectedStyle = styleMap[buttonIndex] || 'Modern & Clean';
    
    console.log(`[Wizard Step 3] FID ${fid} - Business: ${businessName}, Industry: ${industry}, Style: ${selectedStyle}`);
    
    // If button 4 (Generate Logo), proceed to payment
    if (buttonIndex === 4) {
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/pricing.png">
            <meta property="fc:frame:button:1" content="💳 Pay 0.01 ETH - Generate Logo">
            <meta property="fc:frame:button:2" content="💎 Pay 0.045 ETH - 5 Logos (10% off)">
            <meta property="fc:frame:button:3" content="🔙 Back to Style">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/payment?name=${encodeURIComponent(businessName)}&industry=${encodeURIComponent(industry)}&style=default&fid=${fid}">
            <title>Choose Package</title>
          </head>
          <body>
            <h1>Ready to Generate!</h1>
            <p>Choose your package for "${businessName}"</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Style selected, show generate option
    const frameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/wizard-final.png">
          <meta property="fc:frame:button:1" content="✨ Generate Logo Now!">
          <meta property="fc:frame:button:2" content="🔄 Change Style">
          <meta property="fc:frame:button:3" content="🔙 Start Over">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/payment?name=${encodeURIComponent(businessName)}&industry=${encodeURIComponent(industry)}&style=${encodeURIComponent(selectedStyle)}&fid=${fid}">
          <title>Final Settings</title>
        </head>
        <body>
          <h1>"${businessName}"</h1>
          <p>Industry: ${industry}</p>
          <p>Style: ${selectedStyle}</p>
          <p>Ready to generate your logo!</p>
        </body>
      </html>
    `;
    
    return new NextResponse(frameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Wizard Step 3] Error:', error);
    
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
