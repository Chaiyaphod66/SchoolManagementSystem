const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function upsertById(model, rows) {
  for (const row of rows) {
    await prisma[model].upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });
  }
}

async function upsertByUnique(model, field, rows) {
  for (const row of rows) {
    await prisma[model].upsert({
      where: { [field]: row[field] },
      update: row,
      create: row,
    });
  }
}

async function ensureBy(model, where, data) {
  const existing = await prisma[model].findFirst({ where });
  if (existing) {
    return prisma[model].update({ where: { id: existing.id }, data });
  }
  return prisma[model].create({ data });
}

async function main() {
  console.log('Seeding local master data...');

  await upsertByUnique('roles', 'role_name', [
    { role_name: 'ADMIN', description: 'ผู้ดูแลระบบ' },
    { role_name: 'DIRECTOR', description: 'ผู้อำนวยการโรงเรียน' },
    { role_name: 'TEACHER', description: 'ครูและบุคลากรทางการศึกษา' },
    { role_name: 'STUDENT', description: 'นักเรียน' },
    { role_name: 'PARENT', description: 'ผู้ปกครอง' },
    { role_name: 'FINANCE', description: 'เจ้าหน้าที่การเงินและพัสดุ' },
  ]);

  await upsertByUnique('name_prefixes', 'prefix_name', [
    { prefix_name: 'เด็กชาย' },
    { prefix_name: 'เด็กหญิง' },
    { prefix_name: 'นาย' },
    { prefix_name: 'นาง' },
    { prefix_name: 'นางสาว' },
    { prefix_name: 'ว่าที่ร้อยตรี' },
  ]);

  for (const name of ['ชาย', 'หญิง', 'ไม่ระบุ']) {
    await ensureBy('genders', { name }, { name });
  }

  await upsertById('student_statuses', [
    { id: 1, status_name: 'active' },
    { id: 2, status_name: 'suspended' },
    { id: 3, status_name: 'graduated' },
    { id: 4, status_name: 'withdrawn' },
    { id: 5, status_name: 'dismissed' },
  ]);

  await upsertById('attendance_status', [
    { id: 1, status_name: 'มาเรียน' },
    { id: 2, status_name: 'ขาดเรียน' },
    { id: 3, status_name: 'ลาป่วย' },
    { id: 4, status_name: 'ลากิจ' },
    { id: 5, status_name: 'มาสาย' },
    { id: 6, status_name: 'เข้าร่วมกิจกรรม' },
  ]);

  await upsertById('day_of_weeks', [
    { id: 1, day_name_th: 'วันจันทร์', day_name_en: 'Monday', short_name: 'จ.', color_code: '#FACC15' },
    { id: 2, day_name_th: 'วันอังคาร', day_name_en: 'Tuesday', short_name: 'อ.', color_code: '#F472B6' },
    { id: 3, day_name_th: 'วันพุธ', day_name_en: 'Wednesday', short_name: 'พ.', color_code: '#4ADE80' },
    { id: 4, day_name_th: 'วันพฤหัสบดี', day_name_en: 'Thursday', short_name: 'พฤ.', color_code: '#FB923C' },
    { id: 5, day_name_th: 'วันศุกร์', day_name_en: 'Friday', short_name: 'ศ.', color_code: '#60A5FA' },
  ]);

  await upsertById('periods', [
    { id: 1, period_name: 'คาบที่ 1', start_time: new Date('1970-01-01T08:30:00Z'), end_time: new Date('1970-01-01T09:30:00Z') },
    { id: 2, period_name: 'คาบที่ 2', start_time: new Date('1970-01-01T09:30:00Z'), end_time: new Date('1970-01-01T10:30:00Z') },
    { id: 3, period_name: 'คาบที่ 3', start_time: new Date('1970-01-01T10:30:00Z'), end_time: new Date('1970-01-01T11:30:00Z') },
    { id: 4, period_name: 'คาบที่ 4', start_time: new Date('1970-01-01T12:30:00Z'), end_time: new Date('1970-01-01T13:30:00Z') },
    { id: 5, period_name: 'คาบที่ 5', start_time: new Date('1970-01-01T13:30:00Z'), end_time: new Date('1970-01-01T14:30:00Z') },
    { id: 6, period_name: 'คาบที่ 6', start_time: new Date('1970-01-01T14:30:00Z'), end_time: new Date('1970-01-01T15:30:00Z') },
  ]);

  for (const grade_level_name of ['อนุบาล 1', 'อนุบาล 2', 'อนุบาล 3', 'ประถมศึกษาปีที่ 1', 'ประถมศึกษาปีที่ 2', 'ประถมศึกษาปีที่ 3', 'ประถมศึกษาปีที่ 4', 'ประถมศึกษาปีที่ 5', 'ประถมศึกษาปีที่ 6']) {
    await ensureBy('grade_level', { grade_level_name }, { grade_level_name });
  }

  await upsertByUnique('departments', 'department_name', [
    { department_name: 'ฝ่ายบริหารงานวิชาการ' },
    { department_name: 'ฝ่ายบริหารงานบุคคล' },
    { department_name: 'ฝ่ายบริหารงานงบประมาณ' },
    { department_name: 'ฝ่ายบริหารงานทั่วไป' },
  ]);

  for (const type_name of ['ข้าราชการครู', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'ลูกจ้างประจำ', 'ลูกจ้างชั่วคราว']) {
    await ensureBy('employment_types', { type_name }, { type_name });
  }

  await upsertByUnique('teacher_positions', 'title', [
    { title: 'ผู้อำนวยการสถานศึกษา' },
    { title: 'รองผู้อำนวยการสถานศึกษา' },
    { title: 'ครู' },
    { title: 'ครูผู้ช่วย' },
    { title: 'พนักงานราชการ' },
    { title: 'ครูอัตราจ้าง' },
    { title: 'บุคลากรทางการศึกษา' },
  ]);

  await upsertByUnique('learning_subject_groups', 'group_name', [
    { group_name: 'ภาษาไทย' },
    { group_name: 'คณิตศาสตร์' },
    { group_name: 'วิทยาศาสตร์และเทคโนโลยี' },
    { group_name: 'สังคมศึกษา ศาสนา และวัฒนธรรม' },
    { group_name: 'สุขศึกษาและพลศึกษา' },
    { group_name: 'ศิลปะ' },
    { group_name: 'การงานอาชีพ' },
    { group_name: 'ภาษาต่างประเทศ' },
  ]);

  for (const evaluation_name of ['แบบคะแนน', 'ผ่าน/ไม่ผ่าน', 'คุณลักษณะอันพึงประสงค์']) {
    await ensureBy('evaluation_types', { evaluation_name }, { evaluation_name });
  }

  const scoreEvaluation = await prisma.evaluation_types.findFirst({ where: { evaluation_name: 'แบบคะแนน' } });
  const passEvaluation = await prisma.evaluation_types.findFirst({ where: { evaluation_name: 'ผ่าน/ไม่ผ่าน' } });

  await upsertByUnique('subject_categories', 'category_name', [
    { category_name: 'รายวิชาพื้นฐาน', description: 'รายวิชาพื้นฐานตามหลักสูตร', evaluation_type_id: scoreEvaluation.id },
    { category_name: 'รายวิชาเพิ่มเติม', description: 'รายวิชาเพิ่มเติมของสถานศึกษา', evaluation_type_id: scoreEvaluation.id },
    { category_name: 'กิจกรรมพัฒนาผู้เรียน', description: 'กิจกรรมแนะแนว ลูกเสือ และชุมนุม', evaluation_type_id: passEvaluation.id },
  ]);

  await upsertByUnique('grade_category_types', 'type_name', [
    { type_name: 'คะแนนเก็บ', description: 'คะแนนระหว่างเรียน' },
    { type_name: 'สอบกลางภาค', description: 'คะแนนสอบกลางภาค' },
    { type_name: 'สอบปลายภาค', description: 'คะแนนสอบปลายภาค' },
    { type_name: 'งาน/ชิ้นงาน', description: 'คะแนนจากงานหรือชิ้นงาน' },
    { type_name: 'จิตพิสัย', description: 'คะแนนพฤติกรรมและการมีส่วนร่วม' },
  ]);

  const defaultScale = await ensureBy(
    'grade_scale_groups',
    { name: 'เกณฑ์คะแนนมาตรฐาน 8 ระดับ' },
    {
      name: 'เกณฑ์คะแนนมาตรฐาน 8 ระดับ',
      is_default: true,
      description: 'เกณฑ์การตัดเกรดมาตรฐาน 0–4',
      evaluation_type_id: scoreEvaluation.id,
    },
  );

  const gradeScales = [
    [80, 100, '4', 4],
    [75, 79.99, '3.5', 3.5],
    [70, 74.99, '3', 3],
    [65, 69.99, '2.5', 2.5],
    [60, 64.99, '2', 2],
    [55, 59.99, '1.5', 1.5],
    [50, 54.99, '1', 1],
    [0, 49.99, '0', 0],
  ];
  for (const [min_score, max_score, letter_grade, grade_point] of gradeScales) {
    await ensureBy(
      'grade_scales',
      { grade_scale_group_id: defaultScale.id, letter_grade },
      { grade_scale_group_id: defaultScale.id, min_score, max_score, letter_grade, grade_point },
    );
  }

  await upsertByUnique('budget_types', 'name', [
    { name: 'งบอุดหนุนรัฐบาล' },
    { name: 'งบรายได้สถานศึกษา' },
    { name: 'สมาคมผู้ปกครอง' },
    { name: 'เงินนอกงบประมาณ' },
    { name: 'เงินบริจาค' },
  ]);

  await upsertByUnique('project_types', 'name', [
    { name: 'โครงการตามแผนปฏิบัติการ', description: 'โครงการตามแผนปฏิบัติการประจำปี' },
    { name: 'โครงการเร่งด่วน', description: 'โครงการที่ต้องดำเนินการเร่งด่วน' },
    { name: 'โครงการพิเศษ', description: 'โครงการพิเศษของสถานศึกษา' },
    { name: 'กิจกรรมพัฒนาผู้เรียน', description: 'กิจกรรมเพื่อพัฒนาผู้เรียน' },
  ]);

  await upsertByUnique('expense_categories', 'name', [
    { name: 'ค่าตอบแทน' },
    { name: 'ค่าใช้สอย' },
    { name: 'ค่าวัสดุ' },
    { name: 'ค่าสาธารณูปโภค' },
    { name: 'ค่าครุภัณฑ์' },
    { name: 'ค่าที่ดินและสิ่งก่อสร้าง' },
    { name: 'เงินอุดหนุน' },
    { name: 'รายจ่ายอื่น' },
  ]);

  for (const row of [
    { name: 'กิจกรรมการเรียนการสอน', color_code: '#3B82F6' },
    { name: 'กิจกรรมโรงเรียน', color_code: '#10B981' },
    { name: 'วันหยุด', color_code: '#EF4444' },
    { name: 'ประชุม', color_code: '#8B5CF6' },
    { name: 'อบรม/สัมมนา', color_code: '#F59E0B' },
    { name: 'สอบ', color_code: '#EC4899' },
  ]) {
    await ensureBy('event_types', { name: row.name }, row);
  }

  for (const row of [
    { code: 'ALL', display_name: 'ทุกคน', description: 'ผู้ใช้งานทุกคน', input_type: 'none' },
    { code: 'ROLE', display_name: 'ตามบทบาท', description: 'ระบุกลุ่มตามบทบาทผู้ใช้', input_type: 'select', data_source_api: '/api/roles' },
    { code: 'DEPARTMENT', display_name: 'ตามฝ่ายงาน', description: 'ระบุกลุ่มตามฝ่ายงาน', input_type: 'select', data_source_api: '/api/departments' },
    { code: 'CLASSROOM', display_name: 'ตามห้องเรียน', description: 'ระบุกลุ่มตามห้องเรียน', input_type: 'select', data_source_api: '/api/classrooms' },
    { code: 'USER', display_name: 'รายบุคคล', description: 'ระบุผู้ใช้รายบุคคล', input_type: 'select', data_source_api: '/api/users' },
  ]) {
    await prisma.target_types.upsert({ where: { code: row.code }, update: row, create: row });
  }

  for (const row of [
    { name: 'ช่วยเหลือผู้อื่น', is_positive: true, default_points: 5, description: 'มีน้ำใจและช่วยเหลือผู้อื่น' },
    { name: 'จิตอาสา', is_positive: true, default_points: 10, description: 'เข้าร่วมกิจกรรมจิตอาสา' },
    { name: 'สร้างชื่อเสียงให้โรงเรียน', is_positive: true, default_points: 20, description: 'สร้างผลงานหรือชื่อเสียงให้โรงเรียน' },
    { name: 'มาสาย', is_positive: false, default_points: -5, description: 'มาโรงเรียนหรือเข้าชั้นเรียนสาย' },
    { name: 'ไม่ส่งงาน', is_positive: false, default_points: -5, description: 'ไม่ส่งงานตามกำหนด' },
    { name: 'ขาดเรียนโดยไม่มีเหตุผล', is_positive: false, default_points: -10, description: 'ขาดเรียนโดยไม่มีเหตุผลอันสมควร' },
    { name: 'ทะเลาะวิวาท', is_positive: false, default_points: -20, description: 'ก่อเหตุทะเลาะวิวาท' },
  ]) {
    await ensureBy('behavior_types', { name: row.name }, row);
  }

  await upsertByUnique('evaluation_question_types', 'code_name', [
    { code_name: 'RATING', display_name: 'มาตราส่วนประมาณค่า', requires_choices: false, description: 'เลือกคะแนนตามระดับ' },
    { code_name: 'SINGLE_CHOICE', display_name: 'เลือกได้หนึ่งคำตอบ', requires_choices: true, description: 'เลือกคำตอบเดียวจากตัวเลือก' },
    { code_name: 'MULTIPLE_CHOICE', display_name: 'เลือกได้หลายคำตอบ', requires_choices: true, description: 'เลือกได้มากกว่าหนึ่งคำตอบ' },
    { code_name: 'TEXT', display_name: 'ข้อความ', requires_choices: false, description: 'คำตอบแบบข้อความ' },
    { code_name: 'YES_NO', display_name: 'ใช่/ไม่ใช่', requires_choices: true, description: 'คำตอบแบบใช่หรือไม่ใช่' },
  ]);

  const likert = await ensureBy(
    'evaluation_scale_types',
    { name: 'ระดับความพึงพอใจ 5 ระดับ' },
    { name: 'ระดับความพึงพอใจ 5 ระดับ', description: 'มาตราส่วนประมาณค่า 1–5' },
  );
  for (const row of [
    { label: 'น้อยที่สุด', score_value: 1, order_number: 1 },
    { label: 'น้อย', score_value: 2, order_number: 2 },
    { label: 'ปานกลาง', score_value: 3, order_number: 3 },
    { label: 'มาก', score_value: 4, order_number: 4 },
    { label: 'มากที่สุด', score_value: 5, order_number: 5 },
  ]) {
    await ensureBy(
      'evaluation_scale_items',
      { scale_type_id: likert.id, order_number: row.order_number },
      { ...row, scale_type_id: likert.id },
    );
  }

  for (let buddhistYear = 2563; buddhistYear <= 2569; buddhistYear += 1) {
    const gregorianYear = buddhistYear - 543;
    const isCurrentYear = buddhistYear === 2569;
    const academicYear = await prisma.academic_years.upsert({
      where: { year_name: String(buddhistYear) },
      update: {
        start_date: new Date(`${gregorianYear}-05-16`),
        end_date: new Date(`${gregorianYear + 1}-03-31`),
        is_active: isCurrentYear,
      },
      create: {
        year_name: String(buddhistYear),
        start_date: new Date(`${gregorianYear}-05-16`),
        end_date: new Date(`${gregorianYear + 1}-03-31`),
        is_active: isCurrentYear,
      },
    });

    await prisma.semesters.upsert({
      where: { academic_year_id_semester_number: { academic_year_id: academicYear.id, semester_number: 1 } },
      update: {
        start_date: new Date(`${gregorianYear}-05-16`),
        end_date: new Date(`${gregorianYear}-10-10`),
        is_active: isCurrentYear,
      },
      create: {
        academic_year_id: academicYear.id,
        semester_number: 1,
        start_date: new Date(`${gregorianYear}-05-16`),
        end_date: new Date(`${gregorianYear}-10-10`),
        is_active: isCurrentYear,
      },
    });
    await prisma.semesters.upsert({
      where: { academic_year_id_semester_number: { academic_year_id: academicYear.id, semester_number: 2 } },
      update: {
        start_date: new Date(`${gregorianYear}-11-01`),
        end_date: new Date(`${gregorianYear + 1}-03-31`),
        is_active: false,
      },
      create: {
        academic_year_id: academicYear.id,
        semester_number: 2,
        start_date: new Date(`${gregorianYear}-11-01`),
        end_date: new Date(`${gregorianYear + 1}-03-31`),
        is_active: false,
      },
    });
  }

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      pg_get_serial_sequence('student_statuses', 'id'),
      COALESCE((SELECT MAX(id) FROM student_statuses), 1),
      true
    )
  `);

  console.log('Local master data seeded successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
