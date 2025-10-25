/**
 * Represents a single rule from a .gitignore file.
 */
interface GitignoreRule {
  pattern: RegExp;
  negation: boolean;
}

/**
 * Converts a simple gitignore pattern to a regular expression.
 * This is a simplified implementation and does not cover all edge cases of .gitignore syntax.
 * It handles:
 * - Wildcards (*)
 * - Directory-specific patterns (ending with /)
 * - Root-level patterns (starting with /)
 *
 * @param pattern The gitignore pattern string.
 * @returns A string that can be used to construct a RegExp.
 */
const patternToRegex = (pattern: string): string => {
  // Escape special regex characters, except for '*'
  let regexString = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // Handle wildcards
  regexString = regexString.replace(/\*/g, '[^/]*');

  // If pattern starts with '/', it only matches from the root
  if (regexString.startsWith('/')) {
    regexString = '^' + regexString.substring(1);
  } else {
    // Otherwise, it can match anywhere
    regexString = '(^|/)' + regexString;
  }
  
  // If pattern ends with '/', it only matches directories
  if (regexString.endsWith('/')) {
    regexString = regexString.slice(0, -1) + '(/|$)';
  } else {
    regexString += '($|/)';
  }

  return regexString;
};

/**
 * Parses the content of a .gitignore file into a list of rules.
 * @param content The string content of the .gitignore file.
 * @returns An array of GitignoreRule objects.
 */
const parseGitignore = (content: string): GitignoreRule[] => {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')) // Ignore empty lines and comments
    .map(line => {
      const negation = line.startsWith('!');
      const pattern = negation ? line.substring(1) : line;
      return {
        pattern: new RegExp(patternToRegex(pattern)),
        negation,
      };
    });
};

/**
 * Creates a function that checks if a given path is ignored by the parsed rules.
 * @param gitignoreContent The string content of the .gitignore file.
 * @returns A function `(path: string) => boolean` that returns true if the path should be ignored.
 */
export const createIsIgnored = (gitignoreContent: string): ((path: string) => boolean) => {
  const rules = parseGitignore(gitignoreContent);
  const negationRules = rules.filter(r => r.negation);
  const standardRules = rules.filter(r => !r.negation);

  return (path: string): boolean => {
    // Check for explicit allowance
    if (negationRules.some(rule => rule.pattern.test(path))) {
      return false;
    }
    // Check for exclusion
    return standardRules.some(rule => rule.pattern.test(path));
  };
};
