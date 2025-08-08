import { User } from '../models/User';
import { BotContext } from '../types';

export async function userLoader(ctx: BotContext, next: () => Promise<any>) {
  if (!ctx.from) return next();
  let user = await User.findOne({ userId: ctx.from.id });
  if (!user) {
    user = await User.create({ userId: ctx.from.id });
  }
  ctx.dbUser = user;
  return next();
} 