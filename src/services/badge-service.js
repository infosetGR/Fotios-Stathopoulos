// Badge Service for managing extension icon state
export class BadgeService {
  static states = {
    IDLE: { text: '', color: [0, 0, 0, 0] },
    EMBEDDING: { text: '⚡', color: [66, 133, 244, 255] }, // Google Blue
    PREDICTING: { text: '🤖', color: [15, 157, 88, 255] }, // Google Green
    ERROR: { text: '❌', color: [219, 68, 55, 255] } // Google Red
  };

  static setBadge(state) {
    const badgeState = this.states[state];
    if (badgeState) {
      chrome.action.setBadgeText({ text: badgeState.text });
      chrome.action.setBadgeBackgroundColor({ color: badgeState.color });
    }
  }

  static clear() {
    this.setBadge('IDLE');
  }
}
