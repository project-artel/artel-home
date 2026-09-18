# 두 stage: node 로 빌드하고 nginx 로 정적 파일만 서빙한다. 빌드 도구는 runtime
# 이미지에 남지 않는다.
FROM node:22-alpine AS build

WORKDIR /app

# package.json 과 lock 파일만 먼저 COPY 해서 npm ci layer 를 소스 변경과 분리한다.
# 소스만 고쳤을 때 의존성을 다시 설치하지 않는다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# authApi.ts:5 가 import.meta.env.VITE_ORCHESTRATION_URL 을 읽고, Vite 는 그것을
# 빌드 시점에 문자열 리터럴로 굽는다. 실제 주소 대신 자리를 맡아 두는 문자열로
# 빌드해 두고, docker-entrypoint.sh 가 container 기동 시점에 빌드 산출물 안의 그
# 문자열을 실제 값으로 치환한다.
ENV VITE_ORCHESTRATION_URL=__ARTEL_ORCHESTRATION_URL__
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
COPY --from=build /app/dist /usr/share/nginx/html

COPY docker-entrypoint.sh /usr/local/bin/artel-entrypoint.sh
RUN chmod +x /usr/local/bin/artel-entrypoint.sh

# nginx 이미지의 /docker-entrypoint.d/ 훅은 쓰지 않는다. 그 훅을 도는 loop 에는
# set -e 가 없어서 스크립트가 실패해도 nginx 가 그대로 뜬다. 값이 없을 때 기동을
# 실패시키려면 자체 ENTRYPOINT 여야 한다.
ENTRYPOINT ["/usr/local/bin/artel-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
