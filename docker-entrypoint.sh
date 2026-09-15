#!/bin/sh
set -eu

# 값이 없으면 여기서 죽는다. 그대로 두면 브라우저가
# __ARTEL_ORCHESTRATION_URL__/api/... 로 요청을 보내고, 그 실패는 배포가 아니라
# 사용자 화면에서 처음 보인다.
: "${VITE_ORCHESTRATION_URL:?orchestration 서버 origin 을 VITE_ORCHESTRATION_URL 로 넣어야 한다}"

# 빌드 시점에 심어 둔 자리 표시 문자열을 실제 값으로 바꾼다. 빌드 산출물 전체를
# 뒤지는 대신 nginx 가 서빙하는 디렉터리로 범위를 좁힌다.
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) \
  -exec sed -i "s|__ARTEL_ORCHESTRATION_URL__|${VITE_ORCHESTRATION_URL}|g" {} +

# nginx 이미지 자신의 entrypoint 로 넘긴다. 그것이 template 처리와 로그 설정을 한다.
exec /docker-entrypoint.sh "$@"
