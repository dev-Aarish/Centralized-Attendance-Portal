export const mockAssignedSections = [
  {
    id: 'mock-assignment-1',
    class_section_id: 'mock-cs-101',
    class_sections: {
      courses: { name: 'Data Structures', code: 'CS101', department: 'CSE' },
      section: 'A'
    }
  },
  {
    id: 'mock-assignment-2',
    class_section_id: 'mock-cs-102',
    class_sections: {
      courses: { name: 'Computer Networks', code: 'CS102', department: 'CSE' },
      section: 'B'
    }
  },
  {
    id: 'mock-assignment-3',
    class_section_id: 'mock-cs-103',
    class_sections: {
      courses: { name: 'Operating Systems', code: 'CS103', department: 'CSE' },
      section: 'A'
    }
  }
];

export const mockStudentsMap = {
  'mock-cs-101': [
    { id: 'm-enroll-1', student_profiles: { id: 's1', roll_number: 'CSE-1001', profiles: { full_name: 'Alice Smith' } } },
    { id: 'm-enroll-2', student_profiles: { id: 's2', roll_number: 'CSE-1002', profiles: { full_name: 'Bob Johnson' } } },
    { id: 'm-enroll-3', student_profiles: { id: 's3', roll_number: 'CSE-1003', profiles: { full_name: 'Charlie Brown' } } },
    { id: 'm-enroll-4', student_profiles: { id: 's4', roll_number: 'CSE-1004', profiles: { full_name: 'Diana Prince' } } },
  ],
  'mock-cs-102': [
    { id: 'm-enroll-5', student_profiles: { id: 's5', roll_number: 'CSE-2001', profiles: { full_name: 'Evan Wright' } } },
    { id: 'm-enroll-6', student_profiles: { id: 's6', roll_number: 'CSE-2002', profiles: { full_name: 'Fiona Gallagher' } } },
    { id: 'm-enroll-7', student_profiles: { id: 's7', roll_number: 'CSE-2003', profiles: { full_name: 'George Miller' } } },
  ],
  'mock-cs-103': [
    { id: 'm-enroll-8', student_profiles: { id: 's8', roll_number: 'CSE-3001', profiles: { full_name: 'Hannah Abbott' } } },
    { id: 'm-enroll-9', student_profiles: { id: 's9', roll_number: 'CSE-3002', profiles: { full_name: 'Ian Malcolm' } } },
    { id: 'm-enroll-10', student_profiles: { id: 's10', roll_number: 'CSE-3003', profiles: { full_name: 'Julia Roberts' } } },
    { id: 'm-enroll-11', student_profiles: { id: 's11', roll_number: 'CSE-3004', profiles: { full_name: 'Kevin Bacon' } } },
    { id: 'm-enroll-12', student_profiles: { id: 's12', roll_number: 'CSE-3005', profiles: { full_name: 'Liam Neeson' } } },
  ]
};

export const simulateDelay = (ms = 800) => new Promise(resolve => setTimeout(resolve, ms));

export const mockPreviousSessions = [
  {
    id: 'session-1',
    class_section_id: 'mock-cs-101',
    date: '2026-04-15',
    present: 4,
    total: 4,
  },
  {
    id: 'session-2',
    class_section_id: 'mock-cs-101',
    date: '2026-04-10',
    present: 3,
    total: 4,
  },
  {
    id: 'session-3',
    class_section_id: 'mock-cs-102',
    date: '2026-04-16',
    present: 0,
    total: 3,
    isBunk: true,
  },
  {
    id: 'session-4',
    class_section_id: 'mock-cs-103',
    date: '2026-04-14',
    present: 5,
    total: 5,
  }
];
