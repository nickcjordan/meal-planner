# Weekly Meal Review — Telegram Bot

## Decision

Katie reviewed the options and chose **Telegram Bot** (Option B). She's fine
installing Telegram for this.

## Weekly Cadence

Katie's planning cycle:
- **Saturday evening**: Plan next week's meals
- **Sunday morning**: Grocery shopping

This means the review of *last week's* meals should happen **Saturday
afternoon/evening, before she sits down to plan**. The feedback from last
week directly informs next week's plan.

## How It Works

### Saturday Review Flow

1. **Saturday ~4-5 PM**: Telegram bot sends a message introducing the review:

   ```
   How'd this week's meals go? I'll ask about each one.
   ```

2. Bot sends the first meal with rating buttons (two rows):

   ```
   Spaghetti Carbonara (Monday dinner)
   [ Loved ] [ Liked ] [ OK ]
   [ Didn't like ] [ Skipped ]
   ```

3. Katie taps a rating. Bot responds:

   ```
   Spaghetti Carbonara — Loved! Anything to add?
   [ Add note ] [ Add photo ] [ Next meal ]
   ```

4. She has three options:
   - **Add note** — types freely ("Double the recipe next time",
     "Kids asked for seconds"). Bot captures it.
   - **Add photo** — sends a photo of the meal from camera or camera roll.
     Bot stores it and attaches it to the recipe. Great for recipes that
     don't have a photo yet.
   - **Next meal** — skips ahead immediately.

   She can add both a note and a photo for the same meal, or neither.

5. Repeat for each meal.

6. After the last meal, bot wraps up:

   ```
   All done — thanks! Ready to plan next week?
   [ Open Meal Planner ]
   ```

**Worst case for 5 dinners, no comments:** 10 taps (~30 seconds).
**With a comment on 1 meal:** 11 taps + a sentence of typing.

### Saturday Planning Flow

7. Katie opens the meal planner app to plan next week

8. The AI agent already has her feedback and can use it:
   - "You loved the Chicken Tacos — want something similar this week?"
   - "Salmon got skipped two weeks in a row — dropping it from suggestions"
   - "Last week was heavy on pasta — want more variety?"
   - "You said 'too spicy for the kids' on the curry — I'll tone down the
     heat on anything I suggest this week"

## What We'd Build

### Telegram Bot
- Register bot via @BotFather (free, takes 2 minutes)
- Bot server: AWS Lambda behind API Gateway (essentially free at this scale)
- Inline keyboard buttons for feedback (Telegram native feature)
- Bot writes feedback to DynamoDB via existing `saveFeedback()` function
- Webhook from Telegram delivers button taps to our Lambda

### Onboarding (One-Time Setup)
- Katie opens Telegram, searches for the bot, taps **Start**
- Bot says "Hey! I'll check in every Saturday about your meals."
- Lambda stores her `chat_id` in DynamoDB (new entity: `USER#telegram`)
- That's it — she never has to do this again

### Scheduling
- AWS EventBridge rule: fires every Saturday at ~4 PM Central
- Triggers Lambda that:
  1. Looks up the current week's confirmed session
  2. If no confirmed session exists, or session is already "completed"
     (feedback already submitted via web), skip — send nothing
  3. Resolves recipe names for each planned meal
  4. Sends Telegram message with inline buttons to stored `chat_id`

### Conversation State
- Lambda tracks which meal is "current" for each active review
  (stored in DynamoDB or in-memory with a TTL)
- Each button tap callback includes the `sessionId`, `recipeId`, and rating
- After rating: bot offers "Add note" or "Next meal"
- If "Add note" — bot sets state to "awaiting comment" for that meal;
  the next free-text message is captured as the comment
- If "Add photo" — bot sets state to "awaiting photo"; the next image
  message is captured, downloaded, and uploaded to S3
- She can add both a note and a photo for the same meal (bot stays on
  that meal until she taps "Next meal")
- If she changes her mind on a rating, she can tap the buttons again
  on the original message (Telegram allows re-tapping inline buttons)

### Photo Storage
- Telegram sends photos as `file_id` — Lambda downloads from Telegram's
  servers, uploads to S3 (`meal-planner-photos` bucket)
- S3 URL saved on the recipe record (new `photoUrl` field, or added to
  an existing `images` array)
- If a recipe has no photo, the first one submitted becomes the default
- Additional photos build up a gallery over time (photos of different
  attempts, plating variations, etc.)
- Photos are linked to both the recipe AND the specific feedback entry,
  so you can see "this is what it looked like when we made it on April 6"

### Agent Integration
- Feed last week's feedback into the AI agent's context during planning
- Agent can reference both ratings AND comments when suggesting meals
- Recipe history already tracks feedback per recipe — agent reads this
  via existing MCP tools
- Expand agent planning prompt to pull recent feedback comments, not
  just aggregate ratings — the free-text is where the actionable
  insight lives ("too spicy", "kids hated it", "double the recipe")

## Rating Model

Five ratings per meal, plus optional free-text comment:

| Button       | `wasMade` | `rating` | Meaning                          |
|--------------|-----------|----------|----------------------------------|
| Loved        | `true`    | `5`      | Family hit, definitely make again |
| Liked        | `true`    | `4`      | Good, would have again           |
| OK           | `true`    | `3`      | Fine, not exciting               |
| Didn't like  | `true`    | `1`      | Made it but wouldn't repeat      |
| Skipped      | `false`   | `0`      | Didn't make this meal            |

The optional comment maps to the existing `MealFeedback.comment` field.
Examples of useful comments:
- "Kids hated the sauce"
- "Double the recipe next time — not enough for leftovers"
- "Subbed chicken for shrimp, worked great"
- "Too spicy, tone it down"
- "Made this with the Instant Pot instead, way faster"

## Infrastructure as Code (AWS CDK)

All AWS resources will be managed with CDK in TypeScript — same language as
the rest of the project, lives in the monorepo.

### New package: `infra/`

A CDK app at the root of the monorepo that defines all AWS infrastructure.
This is a good time to bring the existing DynamoDB table under CDK management
too, so everything is in one place going forward.

### Stacks

**`MealPlannerDataStack`** (shared foundation)
- DynamoDB table (import the existing `meal-planner-dev` table into CDK
  management rather than recreating it)
- S3 bucket for meal photos (`meal-planner-photos`)

**`TelegramBotStack`** (the new stuff)
- Lambda function for the Telegram webhook handler
  - Runtime: Node.js 20
  - Bundled with esbuild (CDK's `NodejsFunction` construct handles this)
  - Can import shared code from `packages/db` and `packages/types`
- API Gateway HTTP API (v2) — single POST route for the Telegram webhook
- EventBridge rule — cron expression for every Saturday at 4 PM Central
  (`cron(0 21 ? * SAT *)` in UTC)
- EventBridge target — invokes the same Lambda with a "send-review" event
  (Lambda distinguishes between webhook callbacks and scheduled triggers
  via the event shape)
- SSM Parameter Store — stores the Telegram bot token (not hardcoded,
  not in env vars committed to source)
- IAM roles — Lambda gets DynamoDB read/write, S3 put, SSM read,
  scoped to just the resources it needs

### Why CDK over alternatives

- **vs. SAM**: CDK is more flexible, better for multi-stack projects,
  and we're already in TypeScript everywhere
- **vs. Terraform**: CDK keeps us in one language; Terraform would add
  HCL as a second language to maintain
- **vs. manual CLI**: Not reproducible, easy to forget a permission or
  drift from intended state. "Do it right early."

### Migration path for existing DynamoDB table

The existing table was created manually. CDK can import it:
1. Define the table in CDK with the exact same configuration
2. Run `cdk import` to adopt the existing table without recreating it
3. From that point on, CDK owns the table definition

This is safe — it doesn't delete or recreate the table, just brings it
under CDK's management.

## Future Extensions

Once the Telegram bot exists, it becomes a general notification channel:
- "Your meal plan for the week is ready!" (after Saturday planning)
- "Shopping list is ready — [view list]" (before Sunday shopping)
- "Tonight's dinner: Chicken Tacos — [view recipe]" (daily reminder)
- Quick replies: "Swap tonight's meal" or "I'm ordering takeout"

## Cost

- Telegram Bot API: free
- AWS Lambda: free tier (1M requests/month)
- AWS API Gateway: free tier (1M calls/month)
- AWS EventBridge: free tier (all custom events free)
- DynamoDB: already in use

- S3: free tier (5 GB storage, 20K GET, 2K PUT/month)

**Total: $0/month** (photos add pennies of S3 storage over time)
