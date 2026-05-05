import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  notes: z.string().optional(),
})

const MealPlanSchema = z.object({
  meal: z.string(),
  serves: z.number(),
  ingredients: z.array(IngredientSchema),
})

export type Ingredient = z.infer<typeof IngredientSchema>
export type MealPlan = z.infer<typeof MealPlanSchema>

export async function extractIngredients(
  mealDescription: string,
  apiKey: string,
  serves = 4,
): Promise<MealPlan> {
  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `List the grocery ingredients needed for: "${mealDescription}" for ${serves} people.

Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "meal": "meal name",
  "serves": ${serves},
  "ingredients": [
    { "name": "ingredient name", "quantity": "e.g. 500g or 1 dozen", "notes": "optional tip" }
  ]
}`,
      },
    ],
  })

  const text = message.content[0]?.type === 'text' ? message.content[0].text : ''

  // Strip any accidental markdown fences
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  const parsed = MealPlanSchema.safeParse(JSON.parse(cleaned))
  if (!parsed.success) {
    throw new Error(`Claude returned an unexpected format: ${parsed.error.message}`)
  }

  return parsed.data
}
