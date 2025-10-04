import Agenda from 'agenda';
import { Job as AgendaJob } from 'agenda';
import mongoose from 'mongoose';

// Create a new Agenda instance
const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/logoai';
const agenda = new Agenda({
  db: { address: connectionString, collection: 'jobQueue' },
  processEvery: '30 seconds',
  maxConcurrency: 5
});

// Create a job interface to match what our code expects 
interface JobData {
  id: string;
  name: string;
  data: any;
}

// Define job types
export type JobProcessor = (jobData: JobData) => Promise<any>;
let imageJobProcessor: JobProcessor | null = null;

// For compatibility with existing code
export const imageQueue = {
  add: async (jobName: string, data: any, options: any = {}) => {
    const job = agenda.create(jobName, data);
    
    // Handle timeout option for compatibility (if needed)
    if (options.timeout) {
      // Note: Agenda doesn't have a direct timeout method like BullMQ
      // We'll add a metadata field with the timeout info
      job.attrs.data._timeoutMs = options.timeout;
    }
    
    // Schedule the job to run immediately
    await job.save();
    
    return job;
  }
};

// Start the worker
export function startImageWorker(processImageJob: JobProcessor) {
  // Store the processor function for use in job handlers
  imageJobProcessor = processImageJob;
  
  // Define job handlers
  agenda.define('generate-logo', async (job: AgendaJob) => {
    if (!imageJobProcessor) throw new Error('Image job processor not defined');
    return await imageJobProcessor({
      id: job.attrs._id.toString(),
      name: 'generate-logo',
      data: job.attrs.data
    });
  });
  
  agenda.define('generate-meme', async (job: AgendaJob) => {
    if (!imageJobProcessor) throw new Error('Image job processor not defined');
    return await imageJobProcessor({
      id: job.attrs._id.toString(),
      name: 'generate-meme',
      data: job.attrs.data
    });
  });
  
  agenda.define('generate-sticker', async (job: AgendaJob) => {
    if (!imageJobProcessor) throw new Error('Image job processor not defined');
    return await imageJobProcessor({
      id: job.attrs._id.toString(),
      name: 'generate-sticker',
      data: job.attrs.data
    });
  });
  
  agenda.define('edit-sticker', async (job: AgendaJob) => {
    if (!imageJobProcessor) throw new Error('Image job processor not defined');
    return await imageJobProcessor({
      id: job.attrs._id.toString(),
      name: 'edit-sticker',
      data: job.attrs.data
    });
  });


  // Start agenda
  (async function() {
    await agenda.start();
    console.log('Agenda image worker started');
  })();
} 