'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { socialContextNotes } from '@/lib/db/schema';
import { getSocialActor } from '@/lib/social/actor';

async function actorId(): Promise<string | null> {
  return (await getSocialActor()).createdBy;
}

const noteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function addContextNoteAction(input: { title: string; content: string }) {
  const data = noteSchema.parse(input);
  await db.insert(socialContextNotes).values({
    title: data.title.trim(),
    content: data.content.trim(),
    createdBy: await actorId(),
  });
  revalidatePath('/social/calendar');
}

export async function updateContextNoteAction(input: {
  id: string;
  title: string;
  content: string;
}) {
  const id = z.string().uuid().parse(input.id);
  const data = noteSchema.parse({ title: input.title, content: input.content });
  await db
    .update(socialContextNotes)
    .set({ title: data.title.trim(), content: data.content.trim(), updatedAt: new Date() })
    .where(eq(socialContextNotes.id, id));
  revalidatePath('/social/calendar');
}

export async function deleteContextNoteAction(id: string) {
  const noteId = z.string().uuid().parse(id);
  await db.delete(socialContextNotes).where(eq(socialContextNotes.id, noteId));
  revalidatePath('/social/calendar');
}
