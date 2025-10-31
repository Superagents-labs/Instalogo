import { NextRequest, NextResponse } from 'next/server';
import { FrameRequest } from '../../../../types';
import { neynarService } from '../../../../lib/services/neynar.service';
import { FarcasterUserModel } from '../../../../lib/models/FarcasterUser';
import { LogoGenerationModel } from '../../../../lib/models/LogoGeneration';
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
    const businessName = url.searchParams.get('name') || 'Your Business';
    const industry = url.searchParams.get('industry') || 'Business';
    const style = url.searchParams.get('style') || 'Modern & Clean';
    
    console.log(`[Payment] FID ${fid} - Button: ${buttonIndex}, Business: ${businessName}`);
    
    // Handle button actions
    if (buttonIndex === 3) {
      // Back to style selection
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
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/wizard/step3?name=${encodeURIComponent(businessName)}&industry=${encodeURIComponent(industry)}&fid=${fid}">
            <title>Step 3: Choose Style</title>
          </head>
          <body>
            <h1>Choose Your Logo Style</h1>
            <p>Select the style that best fits "${businessName}"</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Determine package and pricing
    const packageType = buttonIndex === 1 ? 'single' : 'bulk';
    const ethCost = buttonIndex === 1 ? 0.01 : 0.045;
    const logoCount = buttonIndex === 1 ? 2 : 10;
    
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
    }
    
    // Create logo generation record
    const logoGeneration = new LogoGenerationModel({
      fid,
      type: 'logo',
      cost: logoCount, // Number of logos
      ethCost,
      status: 'pending',
      imageUrls: [],
      prompt: `Create a professional ${style.toLowerCase()} logo for "${businessName}" in the ${industry.toLowerCase()} industry.`,
      sessionData: {
        businessName,
        industry,
        style,
        packageType,
        logoCount
      },
      castHash: validation.castHash
    });
    
    await logoGeneration.save();
    
    console.log(`[Payment] Created logo generation record: ${logoGeneration._id}`);
    
    // For now, show payment pending frame (in production, integrate with Base network)
    const frameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/payment-pending.png">
          <meta property="fc:frame:button:1" content="✅ Payment Complete - Generate!">
          <meta property="fc:frame:button:2" content="❌ Cancel Order">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/generate?id=${logoGeneration._id}&fid=${fid}">
          <title>Payment Processing</title>
        </head>
        <body>
          <h1>Payment Required</h1>
          <p>Package: ${packageType === 'single' ? 'Single Logo (2 concepts)' : '5 Logo Pack (10 concepts)'}</p>
          <p>Cost: ${ethCost} ETH</p>
          <p>Business: "${businessName}"</p>
          <p>Style: ${style}</p>
          <br>
          <p><strong>🚧 Demo Mode:</strong> Click "Payment Complete" to simulate payment and generate logos</p>
        </body>
      </html>
    `;
    
    return new NextResponse(frameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Payment] Error:', error);
    
    const errorFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/error.png">
          <meta property="fc:frame:button:1" content="🔄 Try Again">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
          <title>Payment Error</title>
        </head>
        <body>
          <h1>Payment Error</h1>
          <p>Something went wrong with your payment. Please try again.</p>
        </body>
      </html>
    `;
    
    return new NextResponse(errorFrameHtml, {
      headers: { 'Content-Type': 'text/html' },
      status: 500
    });
  }
}
