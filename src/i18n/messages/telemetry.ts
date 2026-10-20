import type { Localized } from '../messages'

/**
 * Every value the daily telemetry statistics carry, and what they never carry. The signup checkbox and
 * the admin settings section both show this list, so it must match `TelemetryReport` in
 * artel-orchestration-server field for field.
 */
export const telemetryEn = {
  showContents: 'Values that are sent',
  sentTitle: 'Sent',
  groups: [
    {
      heading: 'Install',
      items: [
        'Install id: a random UUID made for this install. It tells installs apart, not people.',
        'The orchestration-server version and the agent-server versions used that day',
        'The date the statistics cover (UTC)',
      ],
    },
    {
      heading: 'QA runs, grouped by agent structure name, structure fingerprint, model and reasoning effort',
      items: [
        'Number of finished scenario runs, and the number per status (completed, failed, cancelled and so on)',
        'Total steps and passed steps',
        'Total test cases and passed test cases',
        'Sum and maximum of run time, in seconds',
        'Calls per tool name. Only names of tools built into ARTEL are sent; every other name is counted under other.',
      ],
    },
    {
      heading:
        'LLM usage, grouped by feature (QA run, scenario generation, knowledge search, game context, embedding), provider, model and whose API key paid (the admin key or a user key)',
      items: [
        'Number of calls',
        'Sums of input tokens, output tokens, input tokens read from cache, tokens written to cache, and reasoning tokens',
        'Sum of cost, in USD',
        'Sum of response time, in milliseconds',
      ],
    },
    {
      heading: 'Errors, grouped by where they happened (QA run or orchestration-server), error code and exception class name',
      items: [
        'Number of occurrences',
        'Up to 10 code locations of the first occurrence, as module:function:line. No file paths and no error messages.',
      ],
    },
  ],
  notSentTitle: 'Never sent',
  notSent: [
    'Raw QA run records: log messages, agent reasoning, actions, screen captures, game state',
    'Content maps, knowledge documents, scenarios, test case text, project names, game names',
    'Emails, names, user ids, IP addresses',
    'Names of functions a game registered',
  ],
}

export const telemetryKo: Localized<typeof telemetryEn> = {
  showContents: '보내는 값 보기',
  sentTitle: '보내는 값',
  groups: [
    {
      heading: '설치 정보',
      items: [
        'install id: 이 설치에 무작위로 만든 UUID. 사람이 아니라 설치를 구분합니다.',
        'orchestration-server 버전과 그날 쓰인 agent-server 버전',
        '통계가 다루는 날짜(UTC)',
      ],
    },
    {
      heading: 'QA run. agent 구조 이름, 구조 fingerprint, model, reasoning effort 가 같은 것끼리 묶습니다.',
      items: [
        '끝난 scenario 실행 수와 상태(완료, 실패, 취소 등)별 수',
        'step 전체 수와 통과 수',
        'test case 전체 수와 통과 수',
        '실행 시간의 합과 최댓값(초)',
        'tool 이름별 호출 수. ARTEL 에 내장된 tool 이름만 보내고, 나머지는 other 로 합쳐서 셉니다.',
      ],
    },
    {
      heading:
        'LLM 사용량. 기능(QA run, scenario 생성, knowledge 검색, game context, embedding), provider, model, 비용을 낸 API key(admin key 또는 사용자 key)가 같은 것끼리 묶습니다.',
      items: [
        '호출 수',
        '입력 token, 출력 token, cache 에서 읽은 입력 token, cache 에 쓴 token, reasoning token 의 합',
        '비용 합(USD)',
        '응답 시간 합(ms)',
      ],
    },
    {
      heading: '오류. 발생한 곳(QA run 또는 orchestration-server), 오류 code, 예외 class 이름이 같은 것끼리 묶습니다.',
      items: [
        '발생 횟수',
        '처음 발생한 오류의 코드 위치 최대 10개(module:function:line). 파일 경로와 오류 메시지는 보내지 않습니다.',
      ],
    },
  ],
  notSentTitle: '보내지 않는 값',
  notSent: [
    'QA run 의 원본 기록: 로그 메시지, agent 의 추론, action, screen capture, game state',
    'content map, knowledge 문서, scenario, test case 본문, 프로젝트 이름, 게임 이름',
    'email, 이름, user id, IP 주소',
    '게임이 등록한 함수의 이름',
  ],
}
