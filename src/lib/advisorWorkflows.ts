export type AdvisorWorkflowId = 'roadmap' | 'eligibility' | 'statement' | 'interview';

export interface AdvisorWorkflow {
  id: AdvisorWorkflowId;
  title: string;
  description: string;
  prompt: string;
}

const ENGLISH_WORKFLOWS: AdvisorWorkflow[] = [
  {
    id: 'roadmap',
    title: 'Build a 90-day roadmap',
    description: 'Turn known opportunities and deadlines into a focused weekly plan.',
    prompt: 'Using only my saved student profile, the opportunity records available in ProofPath AI, and deadlines explicitly present in those records, build a practical 90-day scholarship application strategy. Prioritize by explainable eligibility evidence, funding fit, and deadline urgency. Separate confirmed facts from recommendations, identify missing or uncertain details, and give me a weekly action plan. Do not invent scholarships, deadlines, eligibility rules, achievements, or acceptance odds. If the available records are insufficient, tell me exactly what information you need.',
  },
  {
    id: 'eligibility',
    title: 'Diagnose eligibility gaps',
    description: 'Understand what is met, missing, unresolved, or not met.',
    prompt: 'Review my saved student profile against the opportunity records available to ProofPath AI. Return a structured eligibility gap audit with each requirement, the available evidence, and one of these states: rule checks passed, unresolved, needs information, or not met. Treat missing information as unknown, never as a pass. Identify the profile fields or official-source details needed to resolve each gap. Explain that rule checks are not an admission or scholarship decision.',
  },
  {
    id: 'statement',
    title: 'Outline a personal statement',
    description: 'Create an honest story structure without inventing achievements.',
    prompt: 'Help me create a personal statement outline for the opportunity currently in context. If no opportunity is attached, ask me which program I am targeting. Use only achievements, experiences, goals, and profile details I have actually provided. Do not invent awards, leadership roles, hardship, research, impact, or motivations. First identify missing story evidence, then propose a clear outline and specific questions I should answer before drafting.',
  },
  {
    id: 'interview',
    title: 'Prepare for interviews',
    description: 'Practice clear answers and evidence-backed examples.',
    prompt: 'Create an interview-preparation plan for the opportunity currently in context. If no program is attached, ask me which opportunity I am preparing for. Distinguish general practice questions from interview requirements confirmed by the available records. Do not claim that a program uses interviews unless the records support it. Help me structure truthful answers using only my actual experiences and identify areas where I need stronger examples.',
  },
];

const BANGLA_WORKFLOWS: AdvisorWorkflow[] = [
  {
    id: 'roadmap',
    title: '৯০ দিনের আবেদন পরিকল্পনা',
    description: 'বাস্তব সুযোগ ও deadline ধরে সাপ্তাহিক পরিকল্পনা তৈরি করুন।',
    prompt: 'ProofPath AI-তে থাকা আমার সংরক্ষিত শিক্ষার্থী-প্রোফাইল, সুযোগের রেকর্ড এবং সেসব রেকর্ডে স্পষ্টভাবে থাকা deadline ব্যবহার করে আগামী ৯০ দিনের একটি বাস্তবসম্মত scholarship application strategy তৈরি করুন। ব্যাখ্যাযোগ্য eligibility evidence, funding fit এবং deadline urgency অনুযায়ী অগ্রাধিকার দিন। নিশ্চিত তথ্য, আপনার পরামর্শ এবং অনিশ্চিত তথ্য আলাদা করুন। সপ্তাহভিত্তিক কাজের পরিকল্পনা দিন। কোনো scholarship, deadline, eligibility rule, achievement বা acceptance chance বানিয়ে বলবেন না। রেকর্ডে তথ্য কম থাকলে ঠিক কোন তথ্য প্রয়োজন তা জানান।',
  },
  {
    id: 'eligibility',
    title: 'যোগ্যতার ঘাটতি শনাক্ত করুন',
    description: 'কোন শর্ত পূরণ, অনিষ্পন্ন বা তথ্যের অপেক্ষায় আছে বুঝুন।',
    prompt: 'ProofPath AI-তে থাকা আমার সংরক্ষিত শিক্ষার্থী-প্রোফাইলের সঙ্গে উপলব্ধ opportunity records মিলিয়ে একটি structured eligibility gap audit তৈরি করুন। প্রতিটি শর্ত, উপলব্ধ প্রমাণ এবং status দেখান: rule checks passed, unresolved, needs information অথবা not met। কোনো তথ্য অনুপস্থিত থাকলে সেটিকে কখনো pass হিসেবে ধরবেন না। প্রতিটি ঘাটতি সমাধানে কোন profile field বা official-source detail প্রয়োজন তা জানান। স্পষ্ট করুন যে rule checks কোনো admission বা scholarship decision নয়।',
  },
  {
    id: 'statement',
    title: 'Personal Statement-এর কাঠামো',
    description: 'নিজের বাস্তব অভিজ্ঞতার ভিত্তিতে বিশ্বাসযোগ্য গল্প সাজান।',
    prompt: 'বর্তমানে সংযুক্ত opportunity-এর জন্য একটি personal statement outline তৈরিতে সাহায্য করুন। কোনো opportunity সংযুক্ত না থাকলে আগে জিজ্ঞেস করুন আমি কোন program-এর জন্য আবেদন করছি। আমি যে achievements, experiences, goals এবং profile details সত্যিই দিয়েছি শুধু সেগুলো ব্যবহার করুন। কোনো award, leadership role, hardship, research, impact বা motivation বানিয়ে লিখবেন না। প্রথমে কোন story evidence অনুপস্থিত তা জানান, তারপর একটি পরিষ্কার outline এবং draft লেখার আগে আমাকে যে প্রশ্নগুলোর উত্তর দিতে হবে তা দিন।',
  },
  {
    id: 'interview',
    title: 'Interview প্রস্তুতি',
    description: 'সত্যিকারের অভিজ্ঞতা দিয়ে পরিষ্কার উত্তর অনুশীলন করুন।',
    prompt: 'বর্তমানে সংযুক্ত opportunity-এর জন্য interview-preparation plan তৈরি করুন। কোনো program সংযুক্ত না থাকলে আগে জিজ্ঞেস করুন আমি কোন opportunity-এর জন্য প্রস্তুতি নিচ্ছি। সাধারণ practice question এবং উপলব্ধ records-এ নিশ্চিত interview requirement আলাদা করে দেখান। Records সমর্থন না করলে কোনো program-এ interview হয় বলে দাবি করবেন না। আমার বাস্তব অভিজ্ঞতা ব্যবহার করে সত্যনিষ্ঠ উত্তর সাজাতে সাহায্য করুন এবং কোথায় আরও ভালো উদাহরণ প্রয়োজন তা শনাক্ত করুন।',
  },
];

export function getAdvisorWorkflows(language: 'en' | 'bn'): AdvisorWorkflow[] {
  return (language === 'bn' ? BANGLA_WORKFLOWS : ENGLISH_WORKFLOWS).map((workflow) => ({ ...workflow }));
}
