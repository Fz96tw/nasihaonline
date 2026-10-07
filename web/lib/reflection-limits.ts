// Field limits for the Weekly Reflection pool and post template. Pure
// constants (no imports) so the pure template engine, the Zod schemas and the
// client forms can all share them without a circular dependency.

export const REFLECTION_QUOTE_TEXT_MAX = 500;
export const REFLECTION_AUTHOR_MAX = 120;
export const REFLECTION_SOURCE_MAX = 200;
export const REFLECTION_PROMPT_MAX = 300;

// Forum thread titles are capped at 200 (createForumThreadSchema). The title
// template may use {weekOf} and {quote}, where {quote} is shortened to
// REFLECTION_TITLE_QUOTE_MAX; a template is accepted only if its worst-case
// rendering fits FORUM_TITLE_MAX.
export const FORUM_TITLE_MAX = 200;
export const REFLECTION_TITLE_QUOTE_MAX = 100;
export const REFLECTION_TITLE_TEMPLATE_MAX = 120;
export const REFLECTION_BODY_TEMPLATE_MAX = 4000;
// The forum's post body cap (createForumThreadSchema). A body template is
// accepted only if even its worst-case rendering fits.
export const FORUM_POST_BODY_MAX = 10000;
