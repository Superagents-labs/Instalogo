import { NextRequest, NextResponse } from 'next/server';
import { FrameRequest } from '../../../../types';
import { neynarService } from '../../../../lib/services/neynar.service';
import { LogoGenerationModel } from '../../../../lib/models/LogoGeneration';
import { connectDB } from '../../../../lib/db/mongoose';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const generationId = url.searchParams.get('id');
  const fid = url.searchParams.get('fid');
  
  if (!generationId || !fid) {
    return new NextResponse('Missing parameters', { status: 400 });
  }
  
  try {
    await connectDB();
    
    const logoGeneration = await LogoGenerationModel.findById(generationId);
    
    if (!logoGeneration || logoGeneration.fid !== parseInt(fid)) {
      return new NextResponse('Generation not found', { status: 404 });
    }
    
    // Check status and show appropriate frame
    if (logoGeneration.status === 'generating') {
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/generating.png">
            <meta property="fc:frame:button:1" content="🔄 Check Again">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results?id=${generationId}&fid=${fid}">
            <title>Still Generating...</title>
          </head>
          <body>
            <h1>🎨 Still Creating Your Logo...</h1>
            <p>Please wait, this may take up to 60 seconds.</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (logoGeneration.status === 'failed') {
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/failed.png">
            <meta property="fc:frame:button:1" content="🔄 Try Again">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
            <title>Generation Failed</title>
          </head>
          <body>
            <h1>❌ Generation Failed</h1>
            <p>Sorry, we couldn't generate your logo. Please try again.</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (logoGeneration.status === 'completed' && logoGeneration.imageUrls.length > 0) {
      // Use first image as the frame image
      const firstImageUrl = logoGeneration.imageUrls[0];
      
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${firstImageUrl}">
            <meta property="fc:frame:button:1" content="📱 View All Logos">
            <meta property="fc:frame:button:2" content="🔄 Generate More">
            <meta property="fc:frame:button:3" content="📤 Share">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results">
            <title>Your Logos Are Ready!</title>
          </head>
          <body>
            <h1>✨ Your Logos Are Ready!</h1>
            <p>Business: "${logoGeneration.sessionData.businessName}"</p>
            <p>Generated: ${logoGeneration.imageUrls.length} logo concepts</p>
            <p>Style: ${logoGeneration.sessionData.style}</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Default case
    const frameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/pending.png">
          <meta property="fc:frame:button:1" content="🔄 Check Status">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results?id=${generationId}&fid=${fid}">
          <title>Generation Status</title>
        </head>
        <body>
          <h1>Checking Generation Status...</h1>
          <p>Status: ${logoGeneration.status}</p>
        </body>
      </html>
    `;
    
    return new NextResponse(frameHtml, {
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (error) {
    console.error('[Results] Error:', error);
    
    const errorFrameHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta property="fc:frame" content="vNext">
          <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/error.png">
          <meta property="fc:frame:button:1" content="🏠 Start Over">
          <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome">
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

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const frameRequest: FrameRequest = await request.json();
    
    const validation = await neynarService.validateFrameRequest(frameRequest);
    
    if (!validation.isValid) {
      throw new Error('Invalid frame request');
    }

    const { fid, buttonIndex } = validation;
    
    console.log(`[Results POST] FID ${fid} pressed button ${buttonIndex}`);
    
    // Handle button actions
    if (buttonIndex === 1) {
      // View All Logos - redirect to a web page or show carousel
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/gallery.png">
            <meta property="fc:frame:button:1" content="🔙 Back to Results">
            <meta property="fc:frame:button:2" content="💾 Download All">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results">
            <title>Logo Gallery</title>
          </head>
          <body>
            <h1>📱 Logo Gallery</h1>
            <p>Visit our website to download all your logos in high resolution.</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    if (buttonIndex === 2) {
      // Generate More - redirect to welcome
      return new NextResponse(null, {
        status: 302,
        headers: {
          'Location': `${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome`
        }
      });
    }
    
    if (buttonIndex === 3) {
      // Share - show sharing options
      const frameHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta property="fc:frame" content="vNext">
            <meta property="fc:frame:image" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/images/share.png">
            <meta property="fc:frame:button:1" content="🐦 Share on Twitter">
            <meta property="fc:frame:button:2" content="📱 Share on Farcaster">
            <meta property="fc:frame:button:3" content="🔙 Back to Results">
            <meta property="fc:frame:post_url" content="${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/results">
            <title>Share Your Logo</title>
          </head>
          <body>
            <h1>📤 Share Your Creation</h1>
            <p>Show off your new logo to the world!</p>
          </body>
        </html>
      `;
      
      return new NextResponse(frameHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Default response
    return new NextResponse(null, {
      status: 302,
      headers: {
        'Location': `${process.env.FRAME_BASE_URL || 'https://your-domain.vercel.app'}/api/frames/welcome`
      }
    });
    
  } catch (error) {
    console.error('[Results POST] Error:', error);
    return new NextResponse('Error processing request', { status: 500 });
  }
}
