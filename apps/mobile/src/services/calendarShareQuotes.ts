import AsyncStorage from '@react-native-async-storage/async-storage';

export type ShareQuoteMode = 'gentle' | 'toxic' | 'none';

const QUOTES = {
  gentle: {
    'zh-TW': [
      '慢慢來，也很好', '今天，留一點時間給自己', '忙碌之間，記得呼吸', '按自己的步調就好',
      '認真工作，也好好休息', '平凡的日子，也有小美好', '不用每天都滿分', '累了，就停一下',
      '把空閒，留給喜歡的事', '今天也辛苦了', '日子慢慢過，美好慢慢來', '休息，也是生活的一部分',
    ],
    en: [
      'Take your time. You are doing well.', 'Save a little time for yourself today.', 'Remember to breathe between busy moments.', 'Go at your own pace.',
      'Work hard, and rest well too.', 'There is beauty in ordinary days.', 'You do not need a perfect day every day.', 'Pause when you are tired.',
      'Keep your free time for what you love.', 'You worked hard today.', 'Let good things arrive in their own time.', 'Rest is part of living too.',
    ],
  },
  toxic: {
    'zh-TW': [
      '工作很累就休息一下，反正也不會因此做完。', '今天的努力，會成為明天加工作量的依據。',
      '別急，好日子還在排班中。', '你不是沒有成長，只是成長都在工作量上。',
      '放假要好好珍惜，畢竟只是暫時不用上班。', '薪水雖然不多，但工作很願意多給你一點。',
      '每天都有新的挑戰，昨天的也還沒解決。', '不用什麼事都自己扛，留一點給明天的自己。',
      '下班後就別想工作了，工作會自己傳訊息來。', '這個月也要對自己好一點，公司那邊就別等了。',
      '你的付出大家都看見了，所以又交給你了。', '班表上的空白，是生活最後的抵抗。',
    ],
    en: [
      'Take a break. The work will still be there.', 'Today’s hard work is tomorrow’s extra workload.',
      'Good days are still waiting for a shift slot.', 'You have grown. So has your workload.',
      'Cherish your day off. Work is only temporarily away.', 'The pay is modest, but the workload is generous.',
      'Every day brings a new challenge. Yesterday’s is still here.', 'Leave something for tomorrow’s version of you.',
      'Do not think about work after hours. Work will text you.', 'Be kind to yourself this month. The company may not be.',
      'Everyone noticed your effort, so they gave you more.', 'The blank days on your roster are your final resistance.',
    ],
  },
} as const;

type Seed = { anchorMonth: string; index: number };
const pendingSeeds = new Map<string, Promise<Seed>>();

function monthNumber(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Invalid calendar month');
  }
  return year * 12 + month - 1;
}

/** First visit picks a random starting line per account and mode; later months advance in order. */
async function readOrCreateSeed(key: string, yearMonth: string): Promise<Seed> {
  const raw = await AsyncStorage.getItem(key);
  let seed: Seed | null = null;
  if (raw) {
    try {
      const candidate = JSON.parse(raw) as Seed;
      if (Number.isInteger(candidate.index) && candidate.index >= 0 && candidate.index < 12) {
        monthNumber(candidate.anchorMonth);
        seed = candidate;
      }
    } catch {
      // Recover corrupt local preferences with a new saved seed.
    }
  }
  if (!seed) {
    seed = { anchorMonth: yearMonth, index: Math.floor(Math.random() * 12) };
    await AsyncStorage.setItem(key, JSON.stringify(seed));
  }
  return seed;
}

export async function getMonthlyShareQuote(
  accountId: string,
  yearMonth: string,
  mode: Exclude<ShareQuoteMode, 'none'>,
  locale: string,
): Promise<string> {
  const month = monthNumber(yearMonth);
  const key = `ishift:share-quote:v1:${accountId}:${mode}`;
  // Prevent two newly mounted previews from choosing separate random starts.
  let pending = pendingSeeds.get(key);
  if (!pending) {
    pending = readOrCreateSeed(key, yearMonth);
    pendingSeeds.set(key, pending);
    void pending.finally(() => {
      if (pendingSeeds.get(key) === pending) pendingSeeds.delete(key);
    }).catch(() => undefined);
  }
  const seed = await pending;
  const offset = month - monthNumber(seed.anchorMonth);
  const index = ((seed.index + offset) % 12 + 12) % 12;
  const language = locale === 'zh-TW' ? 'zh-TW' : 'en';
  return QUOTES[mode][language][index];
}
