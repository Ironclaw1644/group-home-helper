/**
 * Starter outcome library, shaped to Virginia DBHDS guidance.
 *
 * DRAFT — written from the published guidance, not from a real AHFS plan. It
 * exists so a supervisor starts from something compliant and edits, rather than
 * from an empty box. Every one of these must be rewritten in the person's own
 * terms before it goes in a chart; a template outcome is by definition not
 * person-centered, and Virginia's whole point is that it should be.
 *
 * Source: DBHDS, "2021 Person Centered ISP Guidance" (rev 6.7.21). Key rules
 * it sets, which these follow:
 *
 *   Outcome formula:
 *     [name] [activity / important FOR] (frequency) so that / in order to
 *     [important TO achievement]
 *
 *   Activity formula:
 *     [name] verb [what / when / where]
 *
 *   Measures come in three kinds:
 *     routine        — activity plus how often
 *     skill_building — countable achievement, how often AND how long
 *     health_safety  — the condition under which the support would be removed
 *
 *   And the hierarchy: the outcome is WHERE we want to be, the activities are
 *   WHAT we do to get there, the instructions are HOW we do it.
 *
 * `{name}` is substituted with the resident's preferred name on install.
 */

export type LibraryActivity = {
  description: string;
  measureType: 'routine' | 'skill_building' | 'health_safety';
  measure: string;
  supportInstructions: string;
  dailyQuestion: string;
};

export type LibraryOutcome = {
  key: string;
  title: string;
  lens: 'independence' | 'integration' | 'quality_of_life';
  importantTo: string;
  importantFor?: string;
  statement: string;
  frequency: string;
  activities: LibraryActivity[];
};

export const VIRGINIA_OUTCOME_LIBRARY: LibraryOutcome[] = [
  {
    key: 'community_outing',
    title: 'Getting out in the community',
    lens: 'integration',
    importantTo: 'Being out where things are happening',
    statement:
      '{name} goes somewhere in the community weekly in order to be part of what is happening nearby.',
    frequency: 'Weekly',
    activities: [
      {
        description: '{name} chooses where to go from two or more options.',
        measureType: 'skill_building',
        measure: '{name} makes the choice unprompted once a week for three months.',
        supportInstructions:
          'Offer two options out loud and in pictures. Wait — do not fill the silence. If there is no answer after a minute, offer the two again rather than choosing.',
        dailyQuestion: 'Did {name} choose where to go?'
      },
      {
        description: '{name} goes on the outing with staff support.',
        measureType: 'routine',
        measure: 'Once a week.',
        supportInstructions:
          'Travel the route {name} already knows. Leave before it gets busy if crowds are hard that day.',
        dailyQuestion: 'Did {name} go on an outing today?'
      }
    ]
  },
  {
    key: 'meal_preparation',
    title: 'Cooking for myself',
    lens: 'independence',
    importantTo: 'Making my own food the way I like it',
    statement:
      '{name} prepares a simple meal three times a week in order to make {possessive} own food.',
    frequency: '3x per week',
    activities: [
      {
        description: '{name} prepares a simple meal in the kitchen.',
        measureType: 'skill_building',
        measure:
          '{name} completes four of the five steps without a prompt, three times a week for two months.',
        supportInstructions:
          'Set out the ingredients first. Stand back and let {name} start. Hand-over-hand only at the stove.',
        dailyQuestion: 'Did {name} prepare a meal today?'
      },
      {
        description: '{name} puts away the things used.',
        measureType: 'routine',
        measure: 'After each meal.',
        supportInstructions: 'Name one item at a time rather than saying "clean up".',
        dailyQuestion: 'Did {name} put things away afterwards?'
      }
    ]
  },
  {
    key: 'friendships',
    title: 'Seeing people I like',
    lens: 'integration',
    importantTo: 'Having friends and people to talk to',
    statement:
      '{name} spends time with a person of {possessive} choosing weekly in order to keep up {possessive} friendships.',
    frequency: 'Weekly',
    activities: [
      {
        description: '{name} contacts a friend or family member.',
        measureType: 'routine',
        measure: 'At least once a week.',
        supportInstructions:
          'Offer the phone and the contact list. {name} decides who and whether — do not suggest a name.',
        dailyQuestion: 'Did {name} contact someone today?'
      },
      {
        description: '{name} greets people along the way.',
        measureType: 'skill_building',
        measure: '{name} greets three people a week for three months.',
        supportInstructions: 'Model the greeting once, then step back and let it happen.',
        dailyQuestion: 'Did {name} greet someone today?'
      }
    ]
  },
  {
    key: 'personal_care',
    title: 'Getting ready my own way',
    lens: 'independence',
    importantTo: 'Looking the way I want to look',
    statement:
      '{name} completes {possessive} morning routine daily in order to look {possessive} own way.',
    frequency: 'Daily',
    activities: [
      {
        description: '{name} completes {possessive} morning routine.',
        measureType: 'skill_building',
        measure: '{name} completes the routine with verbal prompts only, daily for one month.',
        supportInstructions:
          'Prompt one step at a time in the same order every morning. Do not do a step for {name} that {subject} started.',
        dailyQuestion: 'Did {name} complete the morning routine?'
      },
      {
        description: '{name} picks out {possessive} own clothes.',
        measureType: 'routine',
        measure: 'Daily.',
        supportInstructions:
          'Lay out two options if the full wardrobe is overwhelming. The choice is {possessive}, including when it does not match.',
        dailyQuestion: 'Did {name} choose {possessive} own clothes?'
      }
    ]
  },
  {
    key: 'health_routine',
    title: 'Staying well',
    lens: 'quality_of_life',
    importantTo: 'Feeling good and doing what I want to do',
    importantFor: 'Following the health protocol in the plan',
    statement:
      '{name} follows {possessive} health routine each day in order to feel well enough for the things {possessive} day holds.',
    frequency: 'Daily',
    activities: [
      {
        description: '{name} takes part in {possessive} health routine as written in the protocol.',
        measureType: 'health_safety',
        // DBHDS asks health/safety measures to state the condition for removal
        // rather than a target — the support ends when the clinician says so.
        measure: 'When the prescribing clinician discontinues the protocol.',
        supportInstructions:
          'Follow the attached protocol exactly. Explain each step before doing it. Record concerns in the note, not just the checkbox.',
        dailyQuestion: 'Was {name}’s health routine followed as written?'
      },
      {
        description: 'Staff check for anything new or concerning.',
        measureType: 'health_safety',
        measure: 'Ongoing while the protocol is in place.',
        supportInstructions:
          'If anything is different from usual, write what was seen — not what it might mean.',
        dailyQuestion: 'Were any concerns noted today?'
      }
    ]
  },
  {
    key: 'money',
    title: 'Handling my own money',
    lens: 'independence',
    importantTo: 'Buying what I want without asking',
    statement:
      '{name} makes a purchase weekly in order to buy things without having to ask.',
    frequency: 'Weekly',
    activities: [
      {
        description: '{name} pays for an item in a shop.',
        measureType: 'skill_building',
        measure: '{name} completes a purchase weekly for two months.',
        supportInstructions:
          'Let {name} hand over the money and take the change. Wait before stepping in — the cashier can wait too.',
        dailyQuestion: 'Did {name} make a purchase today?'
      }
    ]
  }
];

/** Fill the placeholders with this resident's name and pronouns. */
export function personalize(
  text: string,
  name: string,
  pronouns: { subject: string; object: string; possessive: string }
): string {
  return text
    .replace(/\{name\}/g, name)
    .replace(/\{subject\}/g, pronouns.subject)
    .replace(/\{object\}/g, pronouns.object)
    .replace(/\{possessive\}/g, pronouns.possessive);
}
