import type { MitreTechnique, MitreTactic } from './mitre-matrix';

export type { MitreTechnique, MitreTactic };

export const atlasMatrix: MitreTactic[] = [
  {
    id: 'AML-TA0000',
    name: 'ML Model Access',
    short_name: 'ml-model-access',
    description: 'Adversaries gather information about ML models and AI systems to plan attacks.',
    techniques: [
      {
        id: 'AML-T0000',
        name: 'Model Discovery',
        description: 'Adversaries identify ML models in use, their versions, and deployment locations.',
      },
      {
        id: 'AML-T0001',
        name: 'ML Artifact Reconnaissance',
        description:
          'Adversaries gather information about ML artifacts including training data, model files, and pipelines.',
      },
      {
        id: 'AML-T0002',
        name: 'AI Service Enumeration',
        description: 'Adversaries enumerate AI/ML services, APIs, and endpoints to understand the attack surface.',
      },
    ],
  },
  {
    id: 'AML-TA0001',
    name: 'Initial Access',
    short_name: 'initial-access',
    description: 'Adversaries gain initial access to ML systems and AI infrastructure.',
    techniques: [
      {
        id: 'AML-T0003',
        name: 'Supply Chain Compromise',
        description:
          'Adversaries compromise ML supply chain components including pre-trained models, libraries, and datasets.',
        subtechniques: [
          { id: 'AML-T0003.001', name: 'Compromised Pre-trained Model' },
          { id: 'AML-T0003.002', name: 'Malicious Dataset Injection' },
        ],
      },
      {
        id: 'AML-T0004',
        name: 'Exploit Public-Facing ML Application',
        description: 'Adversaries exploit vulnerabilities in public-facing ML applications and inference APIs.',
      },
      {
        id: 'AML-T0005',
        name: 'ML Pipeline Compromise',
        description: 'Adversaries compromise ML pipelines through CI/CD, experiment tracking, or model registries.',
      },
      {
        id: 'AML-T0006',
        name: 'Valid Accounts',
        description: 'Adversaries use legitimate credentials to access ML platforms and infrastructure.',
      },
      {
        id: 'AML-T0007',
        name: 'LLM Plugin Exploitation',
        description: 'Adversaries exploit LLM plugin ecosystems to gain unauthorized access to connected systems.',
      },
    ],
  },
  {
    id: 'AML-TA0002',
    name: 'ML Attack Staging',
    short_name: 'ml-attack-staging',
    description: 'Adversaries prepare the environment for ML-specific attacks.',
    techniques: [
      {
        id: 'AML-T0008',
        name: 'Data Poisoning Preparation',
        description: 'Adversaries identify injection points for poisoning training or fine-tuning data.',
      },
      {
        id: 'AML-T0009',
        name: 'Adversarial Input Crafting',
        description: 'Adversaries craft inputs designed to cause ML model misclassification or failure.',
      },
      {
        id: 'AML-T0010',
        name: 'Prompt Engineering',
        description: 'Adversaries craft prompts to manipulate LLM outputs or bypass guardrails.',
        subtechniques: [
          { id: 'AML-T0010.001', name: 'Direct Prompt Injection' },
          { id: 'AML-T0010.002', name: 'Indirect Prompt Injection' },
          { id: 'AML-T0010.003', name: 'Jailbreaking' },
        ],
      },
      {
        id: 'AML-T0011',
        name: 'Model Extraction Preparation',
        description: 'Adversaries set up infrastructure to extract model parameters or architecture.',
      },
    ],
  },
  {
    id: 'AML-TA0003',
    name: 'Execution',
    short_name: 'execution',
    description: 'Adversaries execute ML-specific attacks against AI systems.',
    techniques: [
      {
        id: 'AML-T0012',
        name: 'Data Poisoning',
        description:
          'Adversaries corrupt training or fine-tuning data to degrade model performance or insert backdoors.',
        subtechniques: [
          { id: 'AML-T0012.001', name: 'Training Data Poisoning' },
          { id: 'AML-T0012.002', name: 'Fine-tuning Data Poisoning' },
        ],
      },
      {
        id: 'AML-T0013',
        name: 'Adversarial Example',
        description: 'Adversaries craft inputs that cause ML models to make incorrect predictions.',
      },
      {
        id: 'AML-T0014',
        name: 'Prompt Injection Attack',
        description: 'Adversaries use crafted prompts to override LLM instructions or extract sensitive data.',
        subtechniques: [
          { id: 'AML-T0014.001', name: 'Prompt Leakage' },
          { id: 'AML-T0014.002', name: 'Role-play Bypass' },
        ],
      },
      {
        id: 'AML-T0015',
        name: 'Model Inversion Attack',
        description: 'Adversaries reconstruct training data by querying the model and analyzing outputs.',
      },
      {
        id: 'AML-T0016',
        name: 'Membership Inference',
        description: 'Adversaries determine whether specific data points were used in model training.',
      },
      {
        id: 'AML-T0017',
        name: 'Model Stealing',
        description: 'Adversaries extract model parameters, architecture, or functionality through API queries.',
      },
    ],
  },
  {
    id: 'AML-TA0004',
    name: 'Persistence',
    short_name: 'persistence',
    description: 'Adversaries maintain access to ML systems across restarts or defensive actions.',
    techniques: [
      {
        id: 'AML-T0018',
        name: 'Backdoor ML Model',
        description: 'Adversaries insert persistent backdoors into ML models during training or fine-tuning.',
      },
      {
        id: 'AML-T0019',
        name: 'ML Pipeline Backdoor',
        description:
          'Adversaries establish persistence in ML CI/CD pipelines, registries, or deployment infrastructure.',
      },
      {
        id: 'AML-T0020',
        name: 'Agent Persistence',
        description: 'Adversaries maintain access through compromised AI agents or MCP server infrastructure.',
      },
    ],
  },
  {
    id: 'AML-TA0005',
    name: 'ML Model Impact',
    short_name: 'ml-model-impact',
    description: 'Adversaries degrade, manipulate, or destroy ML model integrity and availability.',
    techniques: [
      {
        id: 'AML-T0021',
        name: 'Model Denial of Service',
        description: 'Adversaries overwhelm ML inference endpoints with computationally expensive inputs.',
      },
      {
        id: 'AML-T0022',
        name: 'Model Integrity Manipulation',
        description: 'Adversaries alter model behavior through weight modification or quantization attacks.',
      },
      {
        id: 'AML-T0023',
        name: 'Data Exfiltration via ML',
        description: 'Adversaries exfiltrate sensitive data through model-generated outputs.',
      },
      {
        id: 'AML-T0024',
        name: 'Reputation Manipulation',
        description: 'Adversaries manipulate ML model ratings, benchmarks, or evaluation metrics.',
      },
      {
        id: 'AML-T0025',
        name: 'Trust Exploitation',
        description: 'Adversaries exploit user trust in ML system outputs for fraud or social engineering.',
      },
    ],
  },
  {
    id: 'AML-TA0006',
    name: 'Exfiltration',
    short_name: 'exfiltration',
    description: 'Adversaries steal ML models, training data, or proprietary AI intellectual property.',
    techniques: [
      {
        id: 'AML-T0026',
        name: 'Model Export Theft',
        description: 'Adversaries export and steal compiled ML models from production or storage systems.',
      },
      {
        id: 'AML-T0027',
        name: 'Training Data Extraction',
        description: 'Adversaries reconstruct or extract training data through model queries.',
      },
      {
        id: 'AML-T0028',
        name: 'ML Pipeline Data Theft',
        description: 'Adversaries steal data from ML pipelines including feature stores and data lakes.',
      },
    ],
  },
];
