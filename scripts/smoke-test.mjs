import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const port = Number(process.env.SMOKE_PORT || 3217);
const baseUrl = `http://127.0.0.1:${port}`;
const credentials = {
    director: process.env.SMOKE_DIRECTOR_CODE,
    teacher: process.env.SMOKE_TEACHER_CODE,
    student: process.env.SMOKE_STUDENT_CODE,
};
const password = process.env.SMOKE_PASSWORD;

if (!password || Object.values(credentials).some((value) => !value)) {
    throw new Error(
        'Set SMOKE_DIRECTOR_CODE, SMOKE_TEACHER_CODE, SMOKE_STUDENT_CODE and SMOKE_PASSWORD before running the smoke test.',
    );
}

const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    },
);

let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function request(path, options = {}) {
    return fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        ...options,
    });
}

async function waitForServer() {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`Next.js exited before the smoke test started.\n${serverOutput}`);
        }
        try {
            const response = await request('/login');
            if (response.status === 200) return;
        } catch {
            // The production server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for Next.js.\n${serverOutput}`);
}

async function login(role) {
    const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: credentials[role], password, role }),
    });
    if (response.status !== 200) {
        throw new Error(`${role} login failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) throw new Error(`${role} login did not return a session cookie.`);
    return setCookie.split(';', 1)[0];
}

async function expectStatus(label, path, expectedStatus, cookie) {
    const response = await request(path, {
        headers: cookie ? { cookie } : undefined,
    });
    if (response.status !== expectedStatus) {
        throw new Error(`${label}: expected HTTP ${expectedStatus}, received ${response.status}.`);
    }
    console.log(`PASS ${label} (${response.status})`);
}

async function expectPageGroup(label, paths, cookie) {
    for (const path of paths) {
        const response = await request(path, { headers: { cookie } });
        if (response.status !== 200) {
            throw new Error(`${label} page ${path}: expected HTTP 200, received ${response.status}.`);
        }
    }
    console.log(`PASS ${label} pages (${paths.length})`);
}

function stopServer() {
    if (!server.pid || server.exitCode !== null) return;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
        });
    } else {
        server.kill('SIGTERM');
    }
    server.stdout?.destroy();
    server.stderr?.destroy();
    server.unref();
}

try {
    await waitForServer();
    const directorCookie = await login('director');
    const teacherCookie = await login('teacher');
    const studentCookie = await login('student');

    await expectPageGroup('director', [
        '/director/dashboard', '/director/teachers', '/director/students',
        '/director/curriculum', '/director/subjects', '/director/advisors',
        '/director/projects', '/director/activities', '/director/evaluation',
        '/director/behavior', '/director/finance', '/director/actors',
    ], directorCookie);
    await expectPageGroup('teacher', [
        '/teacher/dashboard', '/teacher/students', '/teacher/attendance',
        '/teacher/score_input', '/teacher/grade_cut', '/teacher/behavior',
        '/teacher/fitness', '/teacher/calendar', '/teacher/activity_calendar',
        '/teacher/exam_calendar', '/teacher/teaching_evaluation',
        '/teacher/advisor_evaluation',
    ], teacherCookie);
    await expectPageGroup('student', [
        '/student/dashboard', '/student/profile', '/student/schedule',
        '/student/grades', '/student/learning_results', '/student/conduct',
        '/student/health', '/student/activities', '/student/evaluation',
        '/student/advisor_evaluation',
    ], studentCookie);

    await expectStatus('director dashboard API', '/api/director/dashboard', 200, directorCookie);
    await expectStatus('teacher dashboard API', '/api/teacher/dashboard', 200, teacherCookie);
    await expectStatus('teacher subject list API', '/api/teacher/scores?action=subjects', 200, teacherCookie);
    await expectStatus('student dashboard API', '/api/student/dashboard', 200, studentCookie);
    await expectStatus('student grades API', '/api/student/grades', 200, studentCookie);
    await expectStatus('anonymous API is rejected', '/api/director/dashboard', 401);
    await expectStatus('student cannot call director API', '/api/director/dashboard', 403, studentCookie);
    await expectStatus('teacher cannot call student API', '/api/student/dashboard', 403, teacherCookie);

    console.log('Smoke test completed successfully.');
} finally {
    stopServer();
}
